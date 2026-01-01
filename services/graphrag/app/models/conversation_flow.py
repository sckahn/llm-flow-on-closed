"""
Conversation Flow Models for LangGraph + Neo4j Integration

대화흐름 그래프 스키마:
- Intent: 사용자 의도 (보험금청구, 해지환급금조회, 특약설명 등)
- Condition: 필요한 조건/정보 (상품선택, 가입기간, 청구사유 등)
- Action: 실행할 액션 (검색, 답변생성, 외부API호출 등)

관계:
- (Intent)-[:REQUIRES]->(Condition): 의도 실현에 필요한 조건
- (Condition)-[:NEXT]->(Condition): 조건 순서
- (Condition)-[:SATISFIED]->(Action): 조건 충족 시 액션
- (Condition)-[:BRANCH {when: "value"}]->(Condition): 조건부 분기
"""

from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from enum import Enum


class NodeType(str, Enum):
    """대화흐름 노드 타입"""
    INTENT = "intent"           # 사용자 의도
    CONDITION = "condition"     # 필요 조건
    ACTION = "action"           # 실행 액션
    RESPONSE = "response"       # 응답 템플릿


class ConditionType(str, Enum):
    """조건 타입"""
    SELECT_ONE = "select_one"       # 단일 선택 (라디오)
    SELECT_MULTI = "select_multi"   # 다중 선택 (체크박스)
    TEXT_INPUT = "text_input"       # 텍스트 입력
    DATE_INPUT = "date_input"       # 날짜 입력
    NUMBER_INPUT = "number_input"   # 숫자 입력
    YES_NO = "yes_no"               # 예/아니오
    AUTO_EXTRACT = "auto_extract"   # LLM이 대화에서 자동 추출


class ActionType(str, Enum):
    """액션 타입"""
    GRAPH_SEARCH = "graph_search"       # 지식그래프 검색
    VECTOR_SEARCH = "vector_search"     # 벡터 검색
    HYBRID_SEARCH = "hybrid_search"     # 하이브리드 검색
    LLM_GENERATE = "llm_generate"       # LLM 답변 생성
    API_CALL = "api_call"               # 외부 API 호출
    CLARIFY = "clarify"                 # 추가 질문


# =============================================================================
# Node Models
# =============================================================================

class IntentNode(BaseModel):
    """사용자 의도 노드"""
    id: str = Field(..., description="고유 ID")
    name: str = Field(..., description="의도 이름 (예: 보험금_청구)")
    display_name: str = Field(..., description="표시 이름 (예: 보험금 청구)")
    description: Optional[str] = Field(None, description="설명")
    keywords: List[str] = Field(default_factory=list, description="매칭 키워드")
    examples: List[str] = Field(default_factory=list, description="예시 질문들")
    priority: int = Field(default=0, description="우선순위 (높을수록 먼저 매칭)")
    is_active: bool = Field(default=True, description="활성화 여부")


class ConditionNode(BaseModel):
    """조건 노드 - 사용자에게 물어볼 정보"""
    id: str = Field(..., description="고유 ID")
    name: str = Field(..., description="조건 이름 (예: product_type)")
    display_name: str = Field(..., description="표시 이름 (예: 상품 종류)")
    condition_type: ConditionType = Field(..., description="조건 타입")
    question_template: str = Field(..., description="질문 템플릿")
    options: Optional[List[Dict[str, str]]] = Field(
        None,
        description="선택지 [{value: '...', label: '...'}]"
    )
    options_from_graph: Optional[str] = Field(
        None,
        description="그래프에서 옵션을 동적으로 가져올 Cypher 쿼리"
    )
    validation_rule: Optional[str] = Field(None, description="검증 규칙")
    default_value: Optional[str] = Field(None, description="기본값")
    is_required: bool = Field(default=True, description="필수 여부")
    order: int = Field(default=0, description="순서")


class ActionNode(BaseModel):
    """액션 노드 - 실행할 동작"""
    id: str = Field(..., description="고유 ID")
    name: str = Field(..., description="액션 이름")
    action_type: ActionType = Field(..., description="액션 타입")
    config: Dict[str, Any] = Field(default_factory=dict, description="액션 설정")
    # config 예시:
    # - graph_search: {"cypher_template": "MATCH (e:Entity) WHERE..."}
    # - llm_generate: {"prompt_template": "...", "model": "llama-4-mini"}
    # - api_call: {"url": "...", "method": "POST"}


class ResponseNode(BaseModel):
    """응답 템플릿 노드"""
    id: str = Field(..., description="고유 ID")
    name: str = Field(..., description="응답 이름")
    template: str = Field(..., description="응답 템플릿 (Jinja2)")
    include_graph: bool = Field(default=True, description="그래프 시각화 포함")
    include_sources: bool = Field(default=True, description="출처 포함")


# =============================================================================
# Edge Models
# =============================================================================

class FlowEdge(BaseModel):
    """대화흐름 엣지"""
    id: str = Field(..., description="고유 ID")
    source_id: str = Field(..., description="시작 노드 ID")
    target_id: str = Field(..., description="대상 노드 ID")
    edge_type: str = Field(..., description="엣지 타입 (REQUIRES, NEXT, SATISFIED, BRANCH)")
    condition: Optional[str] = Field(
        None,
        description="분기 조건 (BRANCH인 경우). 예: 'product_type == 변액연금'"
    )
    order: int = Field(default=0, description="순서 (같은 소스에서 여러 엣지인 경우)")


# =============================================================================
# Conversation State
# =============================================================================

class ConversationState(BaseModel):
    """대화 상태 (Redis에 저장)"""
    session_id: str = Field(..., description="세션 ID")
    current_intent: Optional[str] = Field(None, description="현재 감지된 의도")
    current_node_id: Optional[str] = Field(None, description="현재 노드 ID")
    collected_values: Dict[str, Any] = Field(
        default_factory=dict,
        description="수집된 조건값들"
    )
    conversation_history: List[Dict[str, str]] = Field(
        default_factory=list,
        description="대화 히스토리 [{role: 'user'|'assistant', content: '...'}]"
    )
    document_context: Optional[str] = Field(None, description="현재 문서 컨텍스트")
    created_at: str = Field(..., description="생성 시간")
    updated_at: str = Field(..., description="수정 시간")
    expires_at: str = Field(..., description="만료 시간")


# =============================================================================
# API Request/Response
# =============================================================================

class ConversationMessage(BaseModel):
    """대화 메시지 요청"""
    session_id: Optional[str] = Field(None, description="세션 ID (없으면 새로 생성)")
    message: str = Field(..., description="사용자 메시지")
    selected_option: Optional[str] = Field(None, description="선택한 옵션 (clarification 응답시)")
    dataset_id: Optional[str] = Field(None, description="데이터셋 ID")


class ConversationResponse(BaseModel):
    """대화 응답"""
    session_id: str = Field(..., description="세션 ID")
    message: str = Field(..., description="응답 메시지")

    # Clarification 관련
    needs_input: bool = Field(default=False, description="사용자 입력 필요 여부")
    input_type: Optional[ConditionType] = Field(None, description="입력 타입")
    options: Optional[List[Dict[str, str]]] = Field(None, description="선택지")

    # 결과 관련
    is_complete: bool = Field(default=False, description="대화 완료 여부")
    answer: Optional[str] = Field(None, description="최종 답변")
    graph: Optional[Dict[str, Any]] = Field(None, description="그래프 데이터")
    sources: List[Dict[str, Any]] = Field(default_factory=list, description="출처")

    # 디버그
    current_intent: Optional[str] = Field(None, description="감지된 의도")
    collected_values: Dict[str, Any] = Field(default_factory=dict, description="수집된 값들")


# =============================================================================
# Flow Management API
# =============================================================================

class CreateIntentRequest(BaseModel):
    """Intent 생성 요청"""
    name: str
    display_name: str
    description: Optional[str] = None
    keywords: List[str] = []
    examples: List[str] = []


class CreateConditionRequest(BaseModel):
    """Condition 생성 요청"""
    name: str
    display_name: str
    condition_type: ConditionType
    question_template: str
    options: Optional[List[Dict[str, str]]] = None
    options_from_graph: Optional[str] = None
    is_required: bool = True


class CreateEdgeRequest(BaseModel):
    """Edge 생성 요청"""
    source_id: str
    target_id: str
    edge_type: str
    condition: Optional[str] = None
    order: int = 0


class FlowGraph(BaseModel):
    """전체 대화흐름 그래프"""
    intents: List[IntentNode] = []
    conditions: List[ConditionNode] = []
    actions: List[ActionNode] = []
    responses: List[ResponseNode] = []
    edges: List[FlowEdge] = []
