"""
Conversation Engine - LangGraph 기반 대화 워크플로우

주요 기능:
1. 의도 분석 (Intent Classification)
2. 조건 수집 (Information Gathering)
3. 조건부 분기 (Conditional Branching)
4. 검색 실행 (Search Execution)
5. 답변 생성 (Response Generation)

워크플로우 그래프:
    START
      │
      ▼
    ┌─────────────┐
    │ analyze_msg │  ← 메시지 분석, 의도 파악
    └──────┬──────┘
           │
           ▼
    ┌─────────────┐
    │ check_route │  ← 라우팅 결정
    └──────┬──────┘
           │
     ┌─────┴─────┐
     ▼           ▼
┌─────────┐ ┌──────────┐
│ clarify │ │ execute  │
└────┬────┘ └────┬─────┘
     │           │
     ▼           ▼
   WAIT       ┌──────────┐
   USER       │ generate │
              └────┬─────┘
                   │
                   ▼
                  END
"""

import logging
from typing import TypedDict, Optional, List, Dict, Any, Annotated
from datetime import datetime
import json
import httpx

from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages

from app.config import get_settings
from app.services.flow_store import FlowStore
from app.services.session_store import SessionStore
from app.services.graph_store import GraphStore
from app.services.hybrid_search import HybridSearch
from app.models.conversation_flow import (
    ConversationState,
    ConversationMessage,
    ConversationResponse,
    IntentNode,
    ConditionNode,
    ActionNode,
    ConditionType,
    ActionType,
)

logger = logging.getLogger(__name__)


# =============================================================================
# State Definition
# =============================================================================

class WorkflowState(TypedDict):
    """LangGraph 워크플로우 상태"""
    # Session
    session_id: str

    # Input
    user_message: str
    original_query: Optional[str]  # 원래 질문 (조건 수집 중에도 유지)
    selected_option: Optional[str]
    dataset_id: Optional[str]

    # Intent & Flow
    current_intent: Optional[str]
    current_node_id: Optional[str]
    collected_values: Dict[str, Any]

    # Context
    conversation_history: List[Dict[str, str]]
    document_context: Optional[str]

    # Routing
    next_action: str  # 'clarify', 'execute', 'generate', 'end'

    # Output
    response_message: str
    needs_input: bool
    input_type: Optional[str]
    options: Optional[List[Dict[str, str]]]

    # Results
    search_results: Optional[Dict[str, Any]]
    final_answer: Optional[str]
    graph_data: Optional[Dict[str, Any]]
    sources: List[Dict[str, Any]]

    # Flags
    is_complete: bool
    error: Optional[str]


# =============================================================================
# Conversation Engine
# =============================================================================

class ConversationEngine:
    """LangGraph 기반 대화 엔진"""

    def __init__(self):
        self.settings = get_settings()
        self.flow_store = FlowStore()
        self.session_store = SessionStore()
        self.graph_store = GraphStore()

        # Build the workflow graph
        self.workflow = self._build_workflow()

    def _build_workflow(self) -> StateGraph:
        """워크플로우 그래프 구성"""
        workflow = StateGraph(WorkflowState)

        # Add nodes
        workflow.add_node("analyze_message", self._analyze_message)
        workflow.add_node("check_conditions", self._check_conditions)
        workflow.add_node("clarify", self._clarify)
        workflow.add_node("execute_action", self._execute_action)
        workflow.add_node("generate_response", self._generate_response)

        # Set entry point
        workflow.set_entry_point("analyze_message")

        # Add edges with conditional routing
        workflow.add_edge("analyze_message", "check_conditions")

        workflow.add_conditional_edges(
            "check_conditions",
            self._route_after_check,
            {
                "clarify": "clarify",
                "execute": "execute_action",
                "end": END,
            }
        )

        workflow.add_edge("clarify", END)  # Wait for user input
        workflow.add_edge("execute_action", "generate_response")
        workflow.add_edge("generate_response", END)

        return workflow.compile()

    # =========================================================================
    # Workflow Nodes
    # =========================================================================

    def _analyze_message(self, state: WorkflowState) -> WorkflowState:
        """메시지 분석 및 의도 파악"""
        logger.info(f"[ANALYZE_MESSAGE] ENTERING _analyze_message")
        logger.info(f"[ANALYZE_MESSAGE] state keys: {list(state.keys())}")
        logger.info(f"[ANALYZE_MESSAGE] current_intent={state.get('current_intent')}, current_node_id={state.get('current_node_id')}")
        user_message = state["user_message"]
        selected_option = state.get("selected_option")
        logger.info(f"[ANALYZE_MESSAGE] user_message='{user_message}', selected_option={selected_option}")

        # 이전 clarification에 대한 응답인 경우
        if selected_option and state.get("current_node_id"):
            current_node = self.flow_store.get_condition(state["current_node_id"])
            if current_node:
                # 값 수집
                state["collected_values"][current_node.name] = selected_option
                logger.info(f"Collected value: {current_node.name} = {selected_option}")
                return state

        # 새 대화 또는 후속 질문
        # 1. 기존 컨텍스트가 있으면 후속 질문으로 처리
        if state.get("current_intent") and state.get("document_context"):
            # 후속 질문 - 컨텍스트 유지하고 검색 실행
            logger.info(f"Follow-up question with context: {state['current_intent']}")
            return state

        # 2. 원래 질문 저장 (새로운 질문일 때만)
        if user_message and not state.get("original_query"):
            state["original_query"] = user_message
            state["collected_values"]["__original_query__"] = user_message  # 세션에도 저장
            logger.info(f"Saved original query: {user_message}")

        # 3. 새 의도 감지
        intent = self._detect_intent(user_message)
        if intent:
            state["current_intent"] = intent.name
            logger.info(f"Detected intent: {intent.name}")
        else:
            # 의도 감지 실패 - 일반 검색으로 처리
            state["current_intent"] = None
            logger.info("No specific intent detected, will use general search")

        # 3. 문서 컨텍스트 추출
        doc_context = self._extract_document_context(user_message)
        if doc_context:
            state["document_context"] = doc_context
            state["collected_values"]["document_id"] = doc_context
            logger.info(f"Extracted document context: {doc_context}")

        return state

    def _check_conditions(self, state: WorkflowState) -> WorkflowState:
        """필요한 조건 확인 및 다음 단계 결정"""
        logger.info(f"[CHECK_CONDITIONS] ENTERING _check_conditions")
        current_intent = state.get("current_intent")
        logger.info(f"[CHECK_CONDITIONS] current_intent={current_intent}")

        # 의도가 없어도 상품 선택이 안되어 있으면 먼저 물어봄
        if not current_intent:
            # 상품이 이미 선택되어 있으면 검색 실행
            if "product_type" in state.get("collected_values", {}):
                logger.info(f"[CHECK_CONDITIONS] No intent but product selected, going to execute")
                state["next_action"] = "execute"
                return state

            # 상품 선택 조건이 있는지 확인
            product_condition = self.flow_store.get_condition("cond_product")
            if product_condition:
                logger.info(f"[CHECK_CONDITIONS] No intent, asking for product selection first")
                state["current_node_id"] = "cond_product"
                state["next_action"] = "clarify"
                return state

            # 상품 선택 조건이 없으면 바로 검색
            logger.info(f"[CHECK_CONDITIONS] No intent and no product condition, going to execute")
            state["next_action"] = "execute"
            return state

        # Intent에 필요한 조건들 조회
        logger.info(f"[CHECK_CONDITIONS] Looking up intent: intent_{current_intent}")
        try:
            intent = self.flow_store.get_intent(f"intent_{current_intent}") or \
                     self.flow_store.match_intent(state["user_message"])
            logger.info(f"[CHECK_CONDITIONS] Found intent: {intent}")
        except Exception as e:
            logger.error(f"[CHECK_CONDITIONS] Error getting intent: {e}")
            import traceback
            logger.error(traceback.format_exc())
            state["next_action"] = "execute"
            return state

        if not intent:
            logger.info(f"[CHECK_CONDITIONS] Intent not found, going to execute")
            state["next_action"] = "execute"
            return state

        # 현재 노드가 있으면 거기서부터 탐색
        current_node_id = state.get("current_node_id")
        logger.info(f"[CHECK_CONDITIONS] current_node_id={current_node_id}, collected_values={state.get('collected_values')}")
        if current_node_id:
            # 현재 노드의 다음 조건들 확인 (intent 포함하여 BRANCH 평가)
            next_conditions = self.flow_store.get_next_conditions(
                current_node_id,
                state["collected_values"],
                current_intent=current_intent
            )
            logger.info(f"[CHECK_CONDITIONS] next_conditions from {current_node_id}: {[c.id for c in next_conditions]}")
            for next_cond in next_conditions:
                logger.info(f"[CHECK_CONDITIONS] checking next_cond: id={next_cond.id}, name={next_cond.name}")
                if next_cond.name not in state["collected_values"]:
                    logger.info(f"[CHECK_CONDITIONS] unfulfilled condition found: {next_cond.name}, setting next_action=clarify")
                    state["current_node_id"] = next_cond.id
                    state["next_action"] = "clarify"
                    return state

            # 다음 조건이 없으면 액션 확인
            action = self.flow_store.get_action_for_condition(current_node_id)
            logger.info(f"[CHECK_CONDITIONS] action for {current_node_id}: {action}")
            if action:
                state["next_action"] = "execute"
                return state

        # Intent의 첫 번째 조건부터 확인
        conditions = self.flow_store.get_conditions_for_intent(intent.id)

        # 미충족 조건 확인 (BFS 방식으로 탐색)
        def find_next_unfulfilled(condition_id: str, visited: set) -> Optional[str]:
            if condition_id in visited:
                return None
            visited.add(condition_id)

            condition = self.flow_store.get_condition(condition_id)
            if not condition:
                return None

            # 이 조건이 미충족이면 반환
            if condition.name not in state["collected_values"]:
                return condition_id

            # 다음 조건들 확인 (intent 포함하여 BRANCH 평가)
            next_conditions = self.flow_store.get_next_conditions(
                condition_id,
                state["collected_values"],
                current_intent=current_intent
            )
            for next_cond in next_conditions:
                result = find_next_unfulfilled(next_cond.id, visited)
                if result:
                    return result

            return None

        visited = set()
        for condition in conditions:
            next_unfulfilled = find_next_unfulfilled(condition.id, visited)
            if next_unfulfilled:
                state["current_node_id"] = next_unfulfilled
                state["next_action"] = "clarify"
                return state

        # 모든 조건 충족
        state["next_action"] = "execute"
        return state

    def _clarify(self, state: WorkflowState) -> WorkflowState:
        """사용자에게 추가 정보 요청"""
        condition_id = state["current_node_id"]
        condition = self.flow_store.get_condition(condition_id)

        if not condition:
            state["error"] = f"Condition not found: {condition_id}"
            state["next_action"] = "end"
            return state

        # 질문 생성
        question = self._format_question(condition, state)

        # 옵션 가져오기
        options = self._get_options(condition, state)

        state["response_message"] = question
        state["needs_input"] = True
        state["input_type"] = condition.condition_type.value if isinstance(condition.condition_type, ConditionType) else condition.condition_type
        state["options"] = options
        state["is_complete"] = False

        return state

    def _execute_action(self, state: WorkflowState) -> WorkflowState:
        """검색 액션 실행 (동기 방식)"""
        try:
            # 검색 쿼리 구성
            search_query = self._build_search_query(state)

            # 문서 컨텍스트 결정 (선택된 상품 우선)
            document_context = state.get("document_context")
            if not document_context:
                # 선택된 상품 문서 ID 사용
                document_context = state.get("collected_values", {}).get("product_type")

            logger.info(f"[SEARCH] Query: {search_query}, Document: {document_context}")

            # Neo4j 그래프 검색 (동기)
            import re
            question_text = search_query

            # 조사 및 어미 제거 (순서 중요: 복합 조사 먼저)
            question_text = re.sub(r'(이란|란|에서|으로|로부터)', ' ', question_text)  # 복합 조사
            question_text = re.sub(r'(입니까|인가요|입니다|무엇|어떻게|어디|언제|왜|뭐|뭔가요|\?)', ' ', question_text)  # 의문사/어미
            question_text = re.sub(r'([가-힣])(이|가|는|을|를|에|의|로)(?=[가-힣\s]|$)', r'\1 ', question_text)  # 단일 조사 (앞글자 보존)

            # 동사 어간 추출 (되다, 하다 등 제거, 앞글자 보존)
            question_text = re.sub(r'(되는|되어|되면|되고|된|되|하는|하여|하면|하고|한|함)(?=[가-힣\s]|$)', '', question_text)

            keywords = [k.strip() for k in question_text.split() if len(k.strip()) >= 2]
            logger.info(f"[SEARCH] Extracted keywords: {keywords}")

            search_results = []
            seen_ids = set()

            # 1차: 문서 필터 적용하여 검색 (관계 컨텍스트 포함)
            for keyword in keywords[:5]:
                results = self.graph_store.search_with_context(
                    query=keyword,
                    dataset_id=state.get("dataset_id"),
                    source_document_id=document_context,
                    limit=5,  # 각 키워드당 5개로 제한하여 균형있게
                )
                for r in results:
                    if r.get("id") not in seen_ids:
                        seen_ids.add(r.get("id"))
                        search_results.append(r)
                logger.info(f"[SEARCH] Keyword '{keyword}' (filtered): {len(results)} results")

            # 2차: 결과가 부족하면 전체 검색 추가 (우선순위 낮음)
            if len(search_results) < 3 and document_context:
                logger.info(f"[SEARCH] Insufficient results, searching without document filter")
                for keyword in keywords[:3]:
                    results = self.graph_store.search_with_context(
                        query=keyword,
                        dataset_id=state.get("dataset_id"),
                        source_document_id=None,  # 필터 없이 검색
                        limit=5,
                    )
                    for r in results:
                        if r.get("id") not in seen_ids:
                            seen_ids.add(r.get("id"))
                            search_results.append(r)
                    logger.info(f"[SEARCH] Keyword '{keyword}' (global): {len(results)} results")

            state["search_results"] = {
                "results": search_results,
                "total": len(search_results),
            }

            # 그래프 데이터
            if search_results:
                first_entity_id = search_results[0].get("id")
                if first_entity_id:
                    graph = self.graph_store.get_entity_neighbors(
                        entity_id=first_entity_id,
                        max_depth=2,
                        limit=50,
                    )
                    state["graph_data"] = graph.model_dump()
                    state["sources"] = [
                        {"id": r.get("id"), "name": r.get("name"), "score": 1.0}
                        for r in search_results[:10]  # 더 다양한 결과 포함
                    ]

        except Exception as e:
            logger.error(f"Search execution failed: {e}")
            state["error"] = str(e)
            state["search_results"] = {"results": [], "total": 0}

        return state

    def _generate_response(self, state: WorkflowState) -> WorkflowState:
        """최종 답변 생성"""
        try:
            # LLM을 사용하여 답변 생성
            answer = self._call_llm_for_answer(state)

            state["final_answer"] = answer
            state["response_message"] = answer
            state["is_complete"] = True
            state["needs_input"] = False

        except Exception as e:
            logger.error(f"Response generation failed: {e}")
            state["error"] = str(e)
            state["final_answer"] = "죄송합니다. 답변을 생성하는 중 오류가 발생했습니다."
            state["response_message"] = state["final_answer"]
            state["is_complete"] = True

        return state

    # =========================================================================
    # Routing
    # =========================================================================

    def _route_after_check(self, state: WorkflowState) -> str:
        """조건 확인 후 라우팅"""
        return state.get("next_action", "execute")

    # =========================================================================
    # Helper Methods
    # =========================================================================

    def _detect_intent(self, message: str) -> Optional[IntentNode]:
        """의도 감지"""
        # 1. 키워드 기반 매칭
        intent = self.flow_store.match_intent(message)
        if intent:
            return intent

        # 2. LLM 기반 의도 분류
        return self._classify_intent_with_llm(message)

    def _classify_intent_with_llm(self, message: str) -> Optional[IntentNode]:
        """LLM을 사용한 의도 분류"""
        try:
            # 등록된 intent 목록 조회
            intents = self.flow_store.get_all_intents(active_only=True)
            if not intents:
                return None

            # intent 설명 구성
            intent_descriptions = []
            for i, intent in enumerate(intents, 1):
                examples = ", ".join(intent.examples[:2]) if intent.examples else "없음"
                intent_descriptions.append(
                    f"{i}. {intent.name}: {intent.description or intent.display_name} (예: {examples})"
                )
            intent_list = "\n".join(intent_descriptions)

            prompt = f"""사용자의 질문을 분석하여 가장 적합한 의도(intent)를 선택하세요.

## 등록된 의도 목록:
{intent_list}
0. 일반_보험_문의: 위 의도에 해당하지 않는 일반적인 보험 관련 질문

## 사용자 질문:
"{message}"

## 지시사항:
- 위 의도 중 가장 적합한 것의 번호만 답하세요.
- 확실하지 않거나 일반적인 보험 문의면 0을 답하세요.

답변 (숫자만):"""

            response = httpx.post(
                f"{self.settings.llm_api_base}/chat/completions",
                headers={"Authorization": f"Bearer {self.settings.llm_api_key}"},
                json={
                    "model": self.settings.llm_model,
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 10,
                    "temperature": 0.0,
                },
                timeout=30.0,
            )
            response.raise_for_status()
            result = response.json()
            answer = result["choices"][0]["message"]["content"].strip()

            # 숫자 추출
            import re
            match = re.search(r'\d+', answer)
            if match:
                idx = int(match.group())
                if 1 <= idx <= len(intents):
                    selected = intents[idx - 1]
                    logger.info(f"[LLM_INTENT] Classified as: {selected.name}")
                    return selected
                elif idx == 0:
                    # 일반 보험 문의 - None 반환하여 상품 선택으로 유도
                    logger.info(f"[LLM_INTENT] General insurance inquiry - will ask for product")
                    return None

            return None

        except Exception as e:
            logger.warning(f"LLM intent classification failed: {e}")
            return None

    def _extract_document_context(self, message: str) -> Optional[str]:
        """메시지에서 문서 컨텍스트 추출"""
        # 상품 키워드 매칭
        product_patterns = {
            '변액연금': '변액연금보험',
            '변액적립': '변액적립보험',
            '즉시연금': '즉시연금보험',
            '월지급': '월지급식',
            '종신': '종신보험',
            '건강': '건강보험',
        }

        for keyword, pattern in product_patterns.items():
            if keyword in message:
                # DB에서 문서 ID 조회
                return self._find_document_id(pattern)

        return None

    def _get_document_name(self, doc_id: str) -> str:
        """문서 ID로 문서명 조회"""
        try:
            import psycopg2
            import os

            conn = psycopg2.connect(
                host=os.getenv("DIFY_DB_HOST", "postgresql"),
                port=int(os.getenv("DIFY_DB_PORT", "5432")),
                user=os.getenv("DIFY_DB_USER", "llmflow"),
                password=os.getenv("DIFY_DB_PASSWORD", "postgres_llmflow"),
                database=os.getenv("DIFY_DB_NAME", "dify"),
            )
            try:
                cursor = conn.cursor()
                cursor.execute("SELECT name FROM documents WHERE id = %s", (doc_id,))
                row = cursor.fetchone()
                if row:
                    # PDF 확장자 제거하고 + 를 공백으로
                    name = row[0].replace('.pdf', '').replace('+', ' ')
                    return name
                return doc_id  # 못 찾으면 ID 반환
            finally:
                conn.close()
        except Exception as e:
            logger.warning(f"Failed to get document name: {e}")
            return doc_id

    def _find_document_id(self, pattern: str) -> Optional[str]:
        """패턴으로 문서 ID 찾기"""
        try:
            import asyncpg
            import asyncio
            import os

            async def find():
                conn = await asyncpg.connect(
                    host=os.getenv("DIFY_DB_HOST", "postgresql"),
                    port=int(os.getenv("DIFY_DB_PORT", "5432")),
                    user=os.getenv("DIFY_DB_USER", "llmflow"),
                    password=os.getenv("DIFY_DB_PASSWORD", "postgres_llmflow"),
                    database=os.getenv("DIFY_DB_NAME", "dify"),
                )
                try:
                    row = await conn.fetchrow(
                        "SELECT id::text FROM documents WHERE name ILIKE $1 LIMIT 1",
                        f"%{pattern}%"
                    )
                    return row['id'] if row else None
                finally:
                    await conn.close()

            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                return loop.run_until_complete(find())
            finally:
                loop.close()

        except Exception as e:
            logger.warning(f"Failed to find document: {e}")
            return None

    def _format_question(self, condition: ConditionNode, state: WorkflowState) -> str:
        """질문 포맷팅"""
        template = condition.question_template

        # 변수 치환
        for key, value in state["collected_values"].items():
            template = template.replace(f"{{{key}}}", str(value))

        return template

    def _get_options(self, condition: ConditionNode, state: WorkflowState) -> List[Dict[str, str]]:
        """조건에 대한 옵션 가져오기"""
        # 고정 옵션
        if condition.options:
            return condition.options

        # 동적 옵션
        if condition.options_from_graph:
            try:
                # 특수 마커 처리
                if condition.options_from_graph.startswith("DYNAMIC:"):
                    source = condition.options_from_graph.split(":")[1]
                    return self._get_dynamic_options(source, state)

                # Neo4j Cypher 쿼리
                options = self.flow_store.get_dynamic_options(
                    condition.options_from_graph,
                    state["collected_values"]
                )
                return options
            except Exception as e:
                logger.warning(f"Failed to get dynamic options: {e}")

        return []

    def _get_dynamic_options(self, source: str, state: WorkflowState) -> List[Dict[str, str]]:
        """동적 옵션 소스에서 옵션 가져오기"""
        if source == "dify_documents":
            return self._get_dify_documents()
        elif source == "neo4j_entity_types":
            return self._get_neo4j_entity_types(state.get("dataset_id"))
        else:
            logger.warning(f"Unknown dynamic source: {source}")
            return []

    def _get_dify_documents(self) -> List[Dict[str, str]]:
        """Dify 데이터베이스에서 문서 목록 조회 (동기 방식)"""
        try:
            import psycopg2
            import os

            conn = psycopg2.connect(
                host=os.getenv("DIFY_DB_HOST", "postgresql"),
                port=int(os.getenv("DIFY_DB_PORT", "5432")),
                user=os.getenv("DIFY_DB_USER", "llmflow"),
                password=os.getenv("DIFY_DB_PASSWORD", "postgres_llmflow"),
                database=os.getenv("DIFY_DB_NAME", "dify"),
            )
            try:
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT id::text, name
                    FROM documents
                    WHERE name ILIKE '%보험%' OR name ILIKE '%연금%'
                    ORDER BY name
                    LIMIT 20
                """)
                rows = cursor.fetchall()
                return [
                    {"value": row[0], "label": row[1]}
                    for row in rows
                ]
            finally:
                conn.close()

        except Exception as e:
            logger.warning(f"Failed to get Dify documents: {e}")
            return []

    def _get_neo4j_entity_types(self, dataset_id: Optional[str] = None) -> List[Dict[str, str]]:
        """Neo4j에서 엔티티 타입 목록 조회"""
        try:
            cypher = """
            MATCH (e:Entity)
            WHERE $dataset_id IS NULL OR e.dataset_id = $dataset_id
            RETURN DISTINCT e.type as type, count(e) as count
            ORDER BY count DESC
            LIMIT 20
            """
            results = self.graph_store.execute_cypher(cypher, {"dataset_id": dataset_id})
            return [
                {"value": r["type"], "label": f"{r['type']} ({r['count']})"}
                for r in results if r.get("type")
            ]
        except Exception as e:
            logger.warning(f"Failed to get entity types: {e}")
            return []

    def _build_search_query(self, state: WorkflowState) -> str:
        """검색 쿼리 구성"""
        # 원래 질문만 사용 (조건 수집 중에도 유지됨)
        original_query = state.get("original_query") or state["user_message"]
        return original_query

    def _call_llm_for_answer(self, state: WorkflowState) -> str:
        """LLM 호출하여 답변 생성"""
        search_results = state.get("search_results", {})
        results = search_results.get("results", [])

        if not results:
            return "관련 정보를 찾지 못했습니다. 다른 질문을 해주시거나 상품명을 명시해 주세요."

        # 컨텍스트 구성 (엔티티 설명 + 관계 컨텍스트)
        context_parts = []
        for r in results[:10]:
            name = r.get('name', '')
            desc = r.get('description', '')
            context_info = r.get('context', '')  # 관계에서 가져온 추가 정보

            if desc or context_info:
                entry = f"- {name}"
                if desc:
                    entry += f": {desc}"
                if context_info:
                    entry += f" (관련 정보: {context_info})"
                context_parts.append(entry)

        context = "\n".join(context_parts) if context_parts else "참조 정보 없음"

        # 수집된 조건값 (인텐트 기준 컨텍스트)
        collected = state.get("collected_values", {})
        condition_context = []
        if collected.get("product_type"):
            # UUID 대신 문서명 조회
            product_name = self._get_document_name(collected.get("product_type"))
            condition_context.append(f"- 선택한 상품: {product_name}")
        if collected.get("claim_reason"):
            condition_context.append(f"- 청구 사유: {collected.get('claim_reason')}")
        if collected.get("subscription_period"):
            condition_context.append(f"- 가입 기간: {collected.get('subscription_period')}")
        condition_str = "\n".join(condition_context) if condition_context else "없음"

        # 원래 질문 (조건 수집 동안 유지)
        original_query = state.get("original_query") or state["user_message"]
        current_intent = state.get("current_intent") or "일반 보험 문의"

        prompt = f"""당신은 보험 상담 전문가입니다. 다음 정보를 바탕으로 사용자의 질문에 정확히 답변해주세요.

## 사용자 질문
{original_query}

## 상담 유형
{current_intent}

## 수집된 정보
{condition_str}

## 참조 정보 (보험 약관에서 추출)
{context}

## 답변 지침
1. 참조 정보를 기반으로 정확하게 답변하세요.
2. 선택한 상품에 맞는 정보를 우선적으로 제공하세요.
3. 불확실한 내용은 "확인이 필요합니다"라고 명시하세요.
4. 친절하고 전문적인 어조로, 핵심을 간결하게 답변하세요.
5. 절대로 UUID나 문서 ID를 답변에 포함하지 마세요. 상품명만 사용하세요.

답변:"""

        try:
            response = httpx.post(
                f"{self.settings.llm_api_base}/chat/completions",
                headers={"Authorization": f"Bearer {self.settings.llm_api_key}"},
                json={
                    "model": self.settings.llm_model,
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 1024,
                    "temperature": 0.7,
                },
                timeout=60.0,
            )
            response.raise_for_status()
            result = response.json()
            return result["choices"][0]["message"]["content"]

        except Exception as e:
            logger.error(f"LLM call failed: {e}")
            # 폴백: 검색 결과 요약
            return f"관련 정보를 찾았습니다:\n{context}"

    # =========================================================================
    # Public API
    # =========================================================================

    def process_message(self, message: ConversationMessage) -> ConversationResponse:
        """메시지 처리 (메인 진입점)"""
        # 세션 가져오기 또는 생성
        session_state = self.session_store.get_or_create_session(message.session_id)

        # 세션에서 original_query 복원
        original_query = session_state.collected_values.get("__original_query__")

        # 초기 워크플로우 상태 구성
        initial_state: WorkflowState = {
            "session_id": session_state.session_id,
            "user_message": message.message,
            "original_query": original_query,  # 세션에서 복원
            "selected_option": message.selected_option,
            "dataset_id": message.dataset_id,
            "current_intent": session_state.current_intent,
            "current_node_id": session_state.current_node_id,
            "collected_values": session_state.collected_values,
            "conversation_history": session_state.conversation_history,
            "document_context": session_state.document_context,
            "next_action": "",
            "response_message": "",
            "needs_input": False,
            "input_type": None,
            "options": None,
            "search_results": None,
            "final_answer": None,
            "graph_data": None,
            "sources": [],
            "is_complete": False,
            "error": None,
        }

        # 워크플로우 실행
        try:
            final_state = self.workflow.invoke(initial_state)
        except Exception as e:
            logger.error(f"Workflow execution failed: {e}")
            return ConversationResponse(
                session_id=session_state.session_id,
                message=f"처리 중 오류가 발생했습니다: {str(e)}",
                is_complete=True,
            )

        # 세션 상태 업데이트
        session_state.current_intent = final_state.get("current_intent")
        session_state.current_node_id = final_state.get("current_node_id")
        session_state.collected_values = final_state.get("collected_values", {})
        session_state.document_context = final_state.get("document_context")

        # 대화 히스토리 추가
        self.session_store.add_message(session_state.session_id, "user", message.message)
        if final_state.get("response_message"):
            self.session_store.add_message(
                session_state.session_id,
                "assistant",
                final_state["response_message"]
            )

        self.session_store.update_session(session_state)

        # 응답 구성
        return ConversationResponse(
            session_id=session_state.session_id,
            message=final_state.get("response_message", ""),
            needs_input=final_state.get("needs_input", False),
            input_type=ConditionType(final_state["input_type"]) if final_state.get("input_type") else None,
            options=final_state.get("options"),
            is_complete=final_state.get("is_complete", False),
            answer=final_state.get("final_answer"),
            graph=final_state.get("graph_data"),
            sources=final_state.get("sources", []),
            current_intent=final_state.get("current_intent"),
            collected_values=final_state.get("collected_values", {}),
        )

    def reset_conversation(self, session_id: str) -> bool:
        """대화 초기화"""
        return self.session_store.reset_session(session_id) is not None

    def get_conversation_state(self, session_id: str) -> Optional[ConversationState]:
        """대화 상태 조회"""
        return self.session_store.get_session(session_id)
