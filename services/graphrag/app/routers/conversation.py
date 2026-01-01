"""
Conversation Router - 대화형 GraphRAG API

주요 엔드포인트:
- POST /conversation/chat: 대화 메시지 처리
- GET /conversation/session/{session_id}: 세션 상태 조회
- POST /conversation/session/{session_id}/reset: 세션 초기화
- GET /conversation/flow: 대화흐름 그래프 조회
- POST /conversation/flow/intent: Intent 생성
- POST /conversation/flow/condition: Condition 생성
- POST /conversation/flow/edge: Edge 생성
- POST /conversation/flow/seed: 기본 데이터 시드
"""

from fastapi import APIRouter, HTTPException
from typing import Optional, List

from app.models.conversation_flow import (
    ConversationMessage,
    ConversationResponse,
    ConversationState,
    IntentNode,
    ConditionNode,
    ActionNode,
    FlowEdge,
    FlowGraph,
    CreateIntentRequest,
    CreateConditionRequest,
    CreateEdgeRequest,
    ConditionType,
    ActionType,
)
from app.services.conversation_engine import ConversationEngine
from app.services.flow_store import FlowStore
from app.services.session_store import SessionStore

router = APIRouter(prefix="/conversation", tags=["conversation"])

# Lazy initialization
_engine: Optional[ConversationEngine] = None
_flow_store: Optional[FlowStore] = None
_session_store: Optional[SessionStore] = None


def get_engine() -> ConversationEngine:
    global _engine
    if _engine is None:
        _engine = ConversationEngine()
    return _engine


def get_flow_store() -> FlowStore:
    global _flow_store
    if _flow_store is None:
        _flow_store = FlowStore()
    return _flow_store


def get_session_store() -> SessionStore:
    global _session_store
    if _session_store is None:
        _session_store = SessionStore()
    return _session_store


# =============================================================================
# Chat Endpoints
# =============================================================================

@router.post("/chat", response_model=ConversationResponse)
async def chat(message: ConversationMessage):
    """
    대화 메시지 처리

    - 새 대화 시작: session_id 없이 요청
    - 대화 계속: session_id 포함하여 요청
    - clarification 응답: selected_option 포함하여 요청

    예시:
    ```json
    // 새 대화
    {"message": "보험금 청구하려면 어떻게 해야 하나요?"}

    // clarification 응답
    {"session_id": "...", "message": "", "selected_option": "변액연금보험"}

    // 후속 질문
    {"session_id": "...", "message": "면책사유는 뭐가 있어요?"}
    ```
    """
    try:
        engine = get_engine()
        response = engine.process_message(message)
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/session/{session_id}", response_model=ConversationState)
async def get_session(session_id: str):
    """세션 상태 조회"""
    session_store = get_session_store()
    state = session_store.get_session(session_id)

    if not state:
        raise HTTPException(status_code=404, detail="Session not found")

    return state


@router.post("/session/{session_id}/reset")
async def reset_session(session_id: str):
    """세션 초기화 (대화 히스토리는 유지, 수집된 값 초기화)"""
    session_store = get_session_store()
    state = session_store.reset_session(session_id)

    if not state:
        raise HTTPException(status_code=404, detail="Session not found")

    return {"message": "Session reset successfully", "session_id": session_id}


@router.delete("/session/{session_id}")
async def delete_session(session_id: str):
    """세션 삭제"""
    session_store = get_session_store()
    deleted = session_store.delete_session(session_id)

    if not deleted:
        raise HTTPException(status_code=404, detail="Session not found")

    return {"message": "Session deleted successfully"}


@router.get("/sessions")
async def list_sessions(limit: int = 100):
    """활성 세션 목록 조회"""
    session_store = get_session_store()
    sessions = session_store.list_active_sessions(limit)
    return {"sessions": sessions, "count": len(sessions)}


# =============================================================================
# Flow Management Endpoints
# =============================================================================

@router.get("/flow", response_model=FlowGraph)
async def get_flow_graph(intent_id: Optional[str] = None):
    """
    대화흐름 그래프 조회

    - intent_id 없으면 전체 그래프
    - intent_id 있으면 해당 Intent 관련 노드/엣지만
    """
    flow_store = get_flow_store()
    return flow_store.get_flow_graph(intent_id)


@router.get("/flow/intents", response_model=List[IntentNode])
async def get_intents(active_only: bool = True):
    """모든 Intent 조회"""
    flow_store = get_flow_store()
    return flow_store.get_all_intents(active_only)


@router.post("/flow/intent", response_model=dict)
async def create_intent(request: CreateIntentRequest):
    """Intent 생성"""
    import uuid

    flow_store = get_flow_store()
    intent = IntentNode(
        id=f"intent_{request.name}",
        name=request.name,
        display_name=request.display_name,
        description=request.description,
        keywords=request.keywords,
        examples=request.examples,
        priority=0,
        is_active=True,
    )
    intent_id = flow_store.create_intent(intent)
    return {"id": intent_id, "message": "Intent created successfully"}


@router.put("/flow/intent/{intent_id}")
async def update_intent(intent_id: str, request: CreateIntentRequest):
    """Intent 수정"""
    flow_store = get_flow_store()

    existing = flow_store.get_intent(intent_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Intent not found")

    intent = IntentNode(
        id=intent_id,
        name=request.name,
        display_name=request.display_name,
        description=request.description,
        keywords=request.keywords,
        examples=request.examples,
        priority=existing.priority,
        is_active=existing.is_active,
    )
    flow_store.create_intent(intent)  # MERGE로 업데이트됨
    return {"id": intent_id, "message": "Intent updated successfully"}


@router.delete("/flow/intent/{intent_id}")
async def delete_intent(intent_id: str):
    """Intent 삭제"""
    flow_store = get_flow_store()
    deleted = flow_store.delete_intent(intent_id)

    if not deleted:
        raise HTTPException(status_code=404, detail="Intent not found")

    return {"message": "Intent deleted successfully"}


@router.post("/flow/condition", response_model=dict)
async def create_condition(request: CreateConditionRequest):
    """Condition 생성"""
    flow_store = get_flow_store()
    condition = ConditionNode(
        id=f"cond_{request.name}",
        name=request.name,
        display_name=request.display_name,
        condition_type=request.condition_type,
        question_template=request.question_template,
        options=request.options,
        options_from_graph=request.options_from_graph,
        is_required=request.is_required,
        order=0,
    )
    condition_id = flow_store.create_condition(condition)
    return {"id": condition_id, "message": "Condition created successfully"}


@router.delete("/flow/condition/{condition_id}")
async def delete_condition(condition_id: str):
    """Condition 삭제"""
    flow_store = get_flow_store()
    deleted = flow_store.delete_condition(condition_id)

    if not deleted:
        raise HTTPException(status_code=404, detail="Condition not found")

    return {"message": "Condition deleted successfully"}


@router.post("/flow/action", response_model=dict)
async def create_action(
    name: str,
    action_type: ActionType,
    config: dict = None,
):
    """Action 생성"""
    flow_store = get_flow_store()
    action = ActionNode(
        id=f"action_{name}",
        name=name,
        action_type=action_type,
        config=config or {},
    )
    action_id = flow_store.create_action(action)
    return {"id": action_id, "message": "Action created successfully"}


@router.post("/flow/edge", response_model=dict)
async def create_edge(request: CreateEdgeRequest):
    """Edge 생성"""
    import uuid

    flow_store = get_flow_store()
    edge = FlowEdge(
        id=f"edge_{uuid.uuid4().hex[:8]}",
        source_id=request.source_id,
        target_id=request.target_id,
        edge_type=request.edge_type,
        condition=request.condition,
        order=request.order,
    )
    edge_id = flow_store.create_edge(edge)

    if not edge_id:
        raise HTTPException(status_code=400, detail="Failed to create edge. Check if source and target nodes exist.")

    return {"id": edge_id, "message": "Edge created successfully"}


@router.delete("/flow/edge/{edge_id}")
async def delete_edge(edge_id: str):
    """Edge 삭제"""
    flow_store = get_flow_store()
    deleted = flow_store.delete_edge(edge_id)

    if not deleted:
        raise HTTPException(status_code=404, detail="Edge not found")

    return {"message": "Edge deleted successfully"}


@router.post("/flow/seed")
async def seed_flow_data():
    """기본 대화흐름 데이터 시드"""
    flow_store = get_flow_store()
    flow_store.seed_insurance_flow()
    return {"message": "Flow data seeded successfully"}


# =============================================================================
# Debug Endpoints
# =============================================================================

@router.get("/debug/state/{session_id}")
async def debug_session_state(session_id: str):
    """세션 디버그 정보"""
    session_store = get_session_store()
    state = session_store.get_session(session_id)

    if not state:
        raise HTTPException(status_code=404, detail="Session not found")

    return {
        "session_id": state.session_id,
        "current_intent": state.current_intent,
        "current_node_id": state.current_node_id,
        "collected_values": state.collected_values,
        "document_context": state.document_context,
        "history_count": len(state.conversation_history),
        "ttl_seconds": session_store.get_session_ttl(session_id),
        "created_at": state.created_at,
        "updated_at": state.updated_at,
    }
