"""
Flow Store - Neo4j에 대화흐름 그래프 저장/조회

노드 레이블:
- FlowIntent: 의도 노드
- FlowCondition: 조건 노드
- FlowAction: 액션 노드
- FlowResponse: 응답 노드

관계 타입:
- REQUIRES: Intent → Condition (의도에 필요한 조건)
- NEXT: Condition → Condition (다음 조건)
- BRANCH: Condition → Condition (조건부 분기, when 속성 포함)
- SATISFIED: Condition → Action (조건 충족 시 액션)
- LEADS_TO: Action → Response (액션 결과 응답)
"""

import logging
from typing import List, Optional, Dict, Any
from neo4j import GraphDatabase, Driver

from app.config import get_settings
from app.models.conversation_flow import (
    IntentNode, ConditionNode, ActionNode, ResponseNode,
    FlowEdge, FlowGraph, NodeType, ConditionType, ActionType
)

logger = logging.getLogger(__name__)


class FlowStore:
    """대화흐름 그래프 저장소"""

    def __init__(self):
        settings = get_settings()
        self.driver: Driver = GraphDatabase.driver(
            settings.neo4j_uri,
            auth=(settings.neo4j_user, settings.neo4j_password),
        )
        self._ensure_constraints()

    def _ensure_constraints(self):
        """제약조건 및 인덱스 생성"""
        constraints = [
            "CREATE CONSTRAINT flow_intent_id IF NOT EXISTS FOR (n:FlowIntent) REQUIRE n.id IS UNIQUE",
            "CREATE CONSTRAINT flow_condition_id IF NOT EXISTS FOR (n:FlowCondition) REQUIRE n.id IS UNIQUE",
            "CREATE CONSTRAINT flow_action_id IF NOT EXISTS FOR (n:FlowAction) REQUIRE n.id IS UNIQUE",
            "CREATE CONSTRAINT flow_response_id IF NOT EXISTS FOR (n:FlowResponse) REQUIRE n.id IS UNIQUE",
            "CREATE INDEX flow_intent_name IF NOT EXISTS FOR (n:FlowIntent) ON (n.name)",
            "CREATE INDEX flow_intent_active IF NOT EXISTS FOR (n:FlowIntent) ON (n.is_active)",
        ]
        with self.driver.session() as session:
            for constraint in constraints:
                try:
                    session.run(constraint)
                except Exception as e:
                    logger.debug(f"Constraint may already exist: {e}")

    def close(self):
        self.driver.close()

    # =========================================================================
    # Intent CRUD
    # =========================================================================

    def create_intent(self, intent: IntentNode) -> str:
        """Intent 노드 생성"""
        query = """
        MERGE (n:FlowIntent {id: $id})
        SET n.name = $name,
            n.display_name = $display_name,
            n.description = $description,
            n.keywords = $keywords,
            n.examples = $examples,
            n.priority = $priority,
            n.is_active = $is_active,
            n.updated_at = datetime()
        RETURN n.id as id
        """
        with self.driver.session() as session:
            result = session.run(
                query,
                id=intent.id,
                name=intent.name,
                display_name=intent.display_name,
                description=intent.description,
                keywords=intent.keywords,
                examples=intent.examples,
                priority=intent.priority,
                is_active=intent.is_active,
            )
            return result.single()["id"]

    def get_intent(self, intent_id: str) -> Optional[IntentNode]:
        """Intent 조회"""
        query = "MATCH (n:FlowIntent {id: $id}) RETURN n"
        with self.driver.session() as session:
            result = session.run(query, id=intent_id)
            record = result.single()
            if record:
                data = dict(record["n"])
                return IntentNode(**data)
            return None

    def get_all_intents(self, active_only: bool = True) -> List[IntentNode]:
        """모든 Intent 조회"""
        query = """
        MATCH (n:FlowIntent)
        WHERE $active_only = false OR n.is_active = true
        RETURN n
        ORDER BY n.priority DESC, n.name
        """
        with self.driver.session() as session:
            result = session.run(query, active_only=active_only)
            return [IntentNode(**dict(record["n"])) for record in result]

    def match_intent(self, user_message: str) -> Optional[IntentNode]:
        """사용자 메시지에서 Intent 매칭 (키워드 기반)"""
        query = """
        MATCH (n:FlowIntent)
        WHERE n.is_active = true
        AND ANY(keyword IN n.keywords WHERE $message CONTAINS keyword)
        RETURN n
        ORDER BY n.priority DESC
        LIMIT 1
        """
        with self.driver.session() as session:
            result = session.run(query, message=user_message)
            record = result.single()
            if record:
                return IntentNode(**dict(record["n"]))
            return None

    def delete_intent(self, intent_id: str) -> bool:
        """Intent 삭제 (연결된 엣지도 삭제)"""
        query = "MATCH (n:FlowIntent {id: $id}) DETACH DELETE n RETURN count(n) as deleted"
        with self.driver.session() as session:
            result = session.run(query, id=intent_id)
            return result.single()["deleted"] > 0

    # =========================================================================
    # Condition CRUD
    # =========================================================================

    def create_condition(self, condition: ConditionNode) -> str:
        """Condition 노드 생성"""
        query = """
        MERGE (n:FlowCondition {id: $id})
        SET n.name = $name,
            n.display_name = $display_name,
            n.condition_type = $condition_type,
            n.question_template = $question_template,
            n.options = $options,
            n.options_from_graph = $options_from_graph,
            n.validation_rule = $validation_rule,
            n.default_value = $default_value,
            n.is_required = $is_required,
            n.order = $order,
            n.updated_at = datetime()
        RETURN n.id as id
        """
        # condition_type이 enum이면 .value, 문자열이면 그대로
        cond_type = condition.condition_type.value if isinstance(condition.condition_type, ConditionType) else condition.condition_type
        with self.driver.session() as session:
            result = session.run(
                query,
                id=condition.id,
                name=condition.name,
                display_name=condition.display_name,
                condition_type=cond_type,
                question_template=condition.question_template,
                options=str(condition.options) if condition.options else None,
                options_from_graph=condition.options_from_graph,
                validation_rule=condition.validation_rule,
                default_value=condition.default_value,
                is_required=condition.is_required,
                order=condition.order,
            )
            return result.single()["id"]

    def get_condition(self, condition_id: str) -> Optional[ConditionNode]:
        """Condition 조회"""
        query = "MATCH (n:FlowCondition {id: $id}) RETURN n"
        with self.driver.session() as session:
            result = session.run(query, id=condition_id)
            record = result.single()
            if record:
                data = dict(record["n"])
                # Parse options from string
                if data.get("options") and isinstance(data["options"], str):
                    import ast
                    try:
                        data["options"] = ast.literal_eval(data["options"])
                    except:
                        data["options"] = None
                return ConditionNode(**data)
            return None

    def get_conditions_for_intent(self, intent_id: str) -> List[ConditionNode]:
        """Intent에 필요한 Condition 목록 조회 (순서대로)"""
        query = """
        MATCH (i:FlowIntent {id: $intent_id})-[:REQUIRES]->(c:FlowCondition)
        RETURN c
        ORDER BY c.order
        """
        with self.driver.session() as session:
            result = session.run(query, intent_id=intent_id)
            conditions = []
            for record in result:
                data = dict(record["c"])
                if data.get("options") and isinstance(data["options"], str):
                    import ast
                    try:
                        data["options"] = ast.literal_eval(data["options"])
                    except:
                        data["options"] = None
                conditions.append(ConditionNode(**data))
            return conditions

    def delete_condition(self, condition_id: str) -> bool:
        """Condition 삭제"""
        query = "MATCH (n:FlowCondition {id: $id}) DETACH DELETE n RETURN count(n) as deleted"
        with self.driver.session() as session:
            result = session.run(query, id=condition_id)
            return result.single()["deleted"] > 0

    # =========================================================================
    # Action CRUD
    # =========================================================================

    def create_action(self, action: ActionNode) -> str:
        """Action 노드 생성"""
        query = """
        MERGE (n:FlowAction {id: $id})
        SET n.name = $name,
            n.action_type = $action_type,
            n.config = $config,
            n.updated_at = datetime()
        RETURN n.id as id
        """
        # action_type이 enum이면 .value, 문자열이면 그대로
        act_type = action.action_type.value if isinstance(action.action_type, ActionType) else action.action_type
        with self.driver.session() as session:
            result = session.run(
                query,
                id=action.id,
                name=action.name,
                action_type=act_type,
                config=str(action.config),
            )
            return result.single()["id"]

    def get_action(self, action_id: str) -> Optional[ActionNode]:
        """Action 조회"""
        query = "MATCH (n:FlowAction {id: $id}) RETURN n"
        with self.driver.session() as session:
            result = session.run(query, id=action_id)
            record = result.single()
            if record:
                data = dict(record["n"])
                if data.get("config") and isinstance(data["config"], str):
                    import ast
                    try:
                        data["config"] = ast.literal_eval(data["config"])
                    except:
                        data["config"] = {}
                return ActionNode(**data)
            return None

    def delete_action(self, action_id: str) -> bool:
        """Action 삭제"""
        query = "MATCH (n:FlowAction {id: $id}) DETACH DELETE n RETURN count(n) as deleted"
        with self.driver.session() as session:
            result = session.run(query, id=action_id)
            return result.single()["deleted"] > 0

    # =========================================================================
    # Edge CRUD
    # =========================================================================

    def create_edge(self, edge: FlowEdge) -> str:
        """엣지 생성"""
        # 동적으로 관계 타입 생성 (REQUIRES, NEXT, BRANCH, SATISFIED, LEADS_TO)
        query = f"""
        MATCH (source) WHERE source.id = $source_id
        MATCH (target) WHERE target.id = $target_id
        MERGE (source)-[r:{edge.edge_type} {{id: $id}}]->(target)
        SET r.condition = $condition,
            r.order = $order,
            r.updated_at = datetime()
        RETURN r.id as id
        """
        with self.driver.session() as session:
            result = session.run(
                query,
                id=edge.id,
                source_id=edge.source_id,
                target_id=edge.target_id,
                condition=edge.condition,
                order=edge.order,
            )
            record = result.single()
            return record["id"] if record else None

    def get_next_conditions(
        self,
        current_condition_id: str,
        collected_values: Dict[str, Any],
        current_intent: Optional[str] = None
    ) -> List[ConditionNode]:
        """현재 조건에서 다음 조건들 조회 (분기 조건 평가 포함)"""
        query = """
        MATCH (c:FlowCondition {id: $condition_id})-[r:NEXT|BRANCH]->(next:FlowCondition)
        RETURN next, r.condition as branch_condition, type(r) as rel_type
        ORDER BY r.order
        """
        with self.driver.session() as session:
            result = session.run(query, condition_id=current_condition_id)
            conditions = []
            for record in result:
                branch_condition = record["branch_condition"]
                rel_type = record["rel_type"]

                # BRANCH인 경우 조건 평가 (intent 포함)
                if rel_type == "BRANCH" and branch_condition:
                    eval_context = {**collected_values, "intent": current_intent}
                    if not self._evaluate_condition(branch_condition, eval_context):
                        logger.debug(f"BRANCH condition '{branch_condition}' not satisfied with context: {eval_context}")
                        continue

                data = dict(record["next"])
                if data.get("options") and isinstance(data["options"], str):
                    import ast
                    try:
                        data["options"] = ast.literal_eval(data["options"])
                    except:
                        data["options"] = None
                conditions.append(ConditionNode(**data))

            return conditions

    def get_action_for_condition(self, condition_id: str) -> Optional[ActionNode]:
        """조건 충족 시 실행할 액션 조회"""
        query = """
        MATCH (c:FlowCondition {id: $condition_id})-[:SATISFIED]->(a:FlowAction)
        RETURN a
        """
        with self.driver.session() as session:
            result = session.run(query, condition_id=condition_id)
            record = result.single()
            if record:
                data = dict(record["a"])
                if data.get("config") and isinstance(data["config"], str):
                    import ast
                    try:
                        data["config"] = ast.literal_eval(data["config"])
                    except:
                        data["config"] = {}
                return ActionNode(**data)
            return None

    def delete_edge(self, edge_id: str) -> bool:
        """엣지 삭제"""
        query = """
        MATCH ()-[r {id: $id}]->()
        DELETE r
        RETURN count(r) as deleted
        """
        with self.driver.session() as session:
            result = session.run(query, id=edge_id)
            return result.single()["deleted"] > 0

    # =========================================================================
    # Flow Graph Operations
    # =========================================================================

    def get_flow_graph(self, intent_id: Optional[str] = None) -> FlowGraph:
        """전체 또는 특정 Intent의 플로우 그래프 조회"""
        if intent_id:
            # 특정 Intent와 연결된 노드/엣지만
            nodes_query = """
            MATCH (i:FlowIntent {id: $intent_id})
            OPTIONAL MATCH (i)-[*]->(n)
            WITH collect(i) + collect(n) as nodes
            UNWIND nodes as node
            RETURN DISTINCT node, labels(node)[0] as label
            """
            edges_query = """
            MATCH (i:FlowIntent {id: $intent_id})
            OPTIONAL MATCH (i)-[r*]->(n)
            UNWIND r as rel
            RETURN DISTINCT rel, startNode(rel).id as source, endNode(rel).id as target, type(rel) as rel_type
            """
        else:
            # 전체 플로우 그래프
            nodes_query = """
            MATCH (n)
            WHERE n:FlowIntent OR n:FlowCondition OR n:FlowAction OR n:FlowResponse
            RETURN n as node, labels(n)[0] as label
            """
            edges_query = """
            MATCH (s)-[r]->(t)
            WHERE (s:FlowIntent OR s:FlowCondition OR s:FlowAction OR s:FlowResponse)
            AND (t:FlowIntent OR t:FlowCondition OR t:FlowAction OR t:FlowResponse)
            RETURN r as rel, s.id as source, t.id as target, type(r) as rel_type
            """

        intents = []
        conditions = []
        actions = []
        responses = []
        edges = []

        with self.driver.session() as session:
            # 노드 조회
            result = session.run(nodes_query, intent_id=intent_id) if intent_id else session.run(nodes_query)
            for record in result:
                node_data = dict(record["node"])
                label = record["label"]

                if label == "FlowIntent":
                    intents.append(IntentNode(**node_data))
                elif label == "FlowCondition":
                    if node_data.get("options") and isinstance(node_data["options"], str):
                        import ast
                        try:
                            node_data["options"] = ast.literal_eval(node_data["options"])
                        except:
                            node_data["options"] = None
                    conditions.append(ConditionNode(**node_data))
                elif label == "FlowAction":
                    if node_data.get("config") and isinstance(node_data["config"], str):
                        import ast
                        try:
                            node_data["config"] = ast.literal_eval(node_data["config"])
                        except:
                            node_data["config"] = {}
                    actions.append(ActionNode(**node_data))
                elif label == "FlowResponse":
                    responses.append(ResponseNode(**node_data))

            # 엣지 조회
            result = session.run(edges_query, intent_id=intent_id) if intent_id else session.run(edges_query)
            for record in result:
                rel_data = dict(record["rel"])
                edges.append(FlowEdge(
                    id=rel_data.get("id", f"{record['source']}_{record['target']}"),
                    source_id=record["source"],
                    target_id=record["target"],
                    edge_type=record["rel_type"],
                    condition=rel_data.get("condition"),
                    order=rel_data.get("order", 0),
                ))

        return FlowGraph(
            intents=intents,
            conditions=conditions,
            actions=actions,
            responses=responses,
            edges=edges,
        )

    def get_dynamic_options(self, cypher_query: str, params: Dict[str, Any] = None) -> List[Dict[str, str]]:
        """그래프에서 동적으로 옵션 조회"""
        with self.driver.session() as session:
            result = session.run(cypher_query, **(params or {}))
            return [dict(record) for record in result]

    # =========================================================================
    # Helper Methods
    # =========================================================================

    def _evaluate_condition(self, condition_expr: str, values: Dict[str, Any]) -> bool:
        """분기 조건 평가 (간단한 표현식)"""
        try:
            # 안전한 평가를 위해 제한된 컨텍스트 사용
            # 예: "product_type == '변액연금'"
            return eval(condition_expr, {"__builtins__": {}}, values)
        except Exception as e:
            logger.warning(f"Failed to evaluate condition '{condition_expr}': {e}")
            return False

    # =========================================================================
    # Seed Data
    # =========================================================================

    def seed_insurance_flow(self):
        """보험 관련 기본 대화흐름 시드 데이터"""
        import uuid

        # Intent: 보험금 청구
        intent_claim = IntentNode(
            id="intent_claim",
            name="보험금_청구",
            display_name="보험금 청구",
            description="보험금 청구 관련 질문",
            keywords=["보험금", "청구", "지급", "받으려면", "신청"],
            examples=[
                "보험금 청구하려면 어떻게 해야 하나요?",
                "보험금 지급받으려면 뭐가 필요해요?",
            ],
            priority=10,
        )
        self.create_intent(intent_claim)

        # Intent: 해지환급금
        intent_cancel = IntentNode(
            id="intent_cancel",
            name="해지_환급금",
            display_name="해지 환급금",
            description="해지 환급금 관련 질문",
            keywords=["해지", "환급금", "해약", "취소"],
            examples=[
                "해지하면 얼마 받을 수 있어요?",
                "해지환급금이 얼마인가요?",
            ],
            priority=8,
        )
        self.create_intent(intent_cancel)

        # Condition: 상품 선택 (옵션은 런타임에 동적으로 로드)
        cond_product = ConditionNode(
            id="cond_product",
            name="product_type",
            display_name="상품 종류",
            condition_type=ConditionType.SELECT_ONE,
            question_template="어떤 보험 상품에 대해 문의하시나요?",
            options=None,  # 동적 로드
            options_from_graph="DYNAMIC:dify_documents",  # 특수 마커
            is_required=True,
            order=1,
        )
        self.create_condition(cond_product)

        # Condition: 청구 사유
        cond_reason = ConditionNode(
            id="cond_reason",
            name="claim_reason",
            display_name="청구 사유",
            condition_type=ConditionType.SELECT_ONE,
            question_template="어떤 사유로 청구하시나요?",
            options=[
                {"value": "death", "label": "사망"},
                {"value": "disability", "label": "장해"},
                {"value": "hospitalization", "label": "입원"},
                {"value": "surgery", "label": "수술"},
                {"value": "diagnosis", "label": "진단"},
            ],
            is_required=True,
            order=2,
        )
        self.create_condition(cond_reason)

        # Condition: 가입 기간
        cond_period = ConditionNode(
            id="cond_period",
            name="subscription_period",
            display_name="가입 기간",
            condition_type=ConditionType.SELECT_ONE,
            question_template="가입하신 지 얼마나 되셨나요?",
            options=[
                {"value": "under_1y", "label": "1년 미만"},
                {"value": "1y_3y", "label": "1년 ~ 3년"},
                {"value": "3y_5y", "label": "3년 ~ 5년"},
                {"value": "over_5y", "label": "5년 이상"},
            ],
            is_required=True,
            order=1,
        )
        self.create_condition(cond_period)

        # Action: 검색 및 답변
        action_search = ActionNode(
            id="action_search_answer",
            name="검색_답변",
            action_type=ActionType.HYBRID_SEARCH,
            config={
                "search_template": "{product_type} {claim_reason} 보험금 지급",
                "include_graph": True,
            },
        )
        self.create_action(action_search)

        # Edges
        # 보험금 청구 -> 상품 선택
        self.create_edge(FlowEdge(
            id="edge_claim_product",
            source_id="intent_claim",
            target_id="cond_product",
            edge_type="REQUIRES",
            order=1,
        ))

        # 상품 선택 -> 청구 사유
        self.create_edge(FlowEdge(
            id="edge_product_reason",
            source_id="cond_product",
            target_id="cond_reason",
            edge_type="NEXT",
            order=1,
        ))

        # 청구 사유 -> 검색 액션
        self.create_edge(FlowEdge(
            id="edge_reason_action",
            source_id="cond_reason",
            target_id="action_search_answer",
            edge_type="SATISFIED",
            order=1,
        ))

        # 해지환급금 -> 상품 선택
        self.create_edge(FlowEdge(
            id="edge_cancel_product",
            source_id="intent_cancel",
            target_id="cond_product",
            edge_type="REQUIRES",
            order=1,
        ))

        # 상품 선택 -> 가입 기간 (해지환급금 경로)
        self.create_edge(FlowEdge(
            id="edge_product_period",
            source_id="cond_product",
            target_id="cond_period",
            edge_type="BRANCH",
            condition="intent == '해지_환급금'",
            order=2,
        ))

        logger.info("Seeded insurance conversation flow")
