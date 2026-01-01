"""
Session Store - Redis 기반 대화 세션 관리

대화 상태를 Redis에 저장하여:
- 멀티턴 대화 컨텍스트 유지
- 수집된 조건값 저장
- 대화 히스토리 관리
- 세션 만료 자동 처리
"""

import json
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta
import redis
import uuid

from app.config import get_settings
from app.models.conversation_flow import ConversationState

logger = logging.getLogger(__name__)


class SessionStore:
    """Redis 기반 세션 저장소"""

    SESSION_PREFIX = "conv_session:"
    DEFAULT_TTL = 3600 * 24  # 24시간

    def __init__(self):
        settings = get_settings()
        self.redis = redis.Redis(
            host=settings.redis_host,
            port=settings.redis_port,
            db=getattr(settings, 'redis_db', 1),  # conversation용 별도 DB
            password=getattr(settings, 'redis_password', None),
            decode_responses=True,
        )
        self.ttl = self.DEFAULT_TTL

    def _get_key(self, session_id: str) -> str:
        return f"{self.SESSION_PREFIX}{session_id}"

    # =========================================================================
    # Session CRUD
    # =========================================================================

    def create_session(self) -> ConversationState:
        """새 세션 생성"""
        now = datetime.utcnow()
        session_id = str(uuid.uuid4())

        state = ConversationState(
            session_id=session_id,
            current_intent=None,
            current_node_id=None,
            collected_values={},
            conversation_history=[],
            document_context=None,
            created_at=now.isoformat(),
            updated_at=now.isoformat(),
            expires_at=(now + timedelta(seconds=self.ttl)).isoformat(),
        )

        self._save_state(state)
        return state

    def get_session(self, session_id: str) -> Optional[ConversationState]:
        """세션 조회"""
        key = self._get_key(session_id)
        data = self.redis.get(key)

        if not data:
            return None

        try:
            state_dict = json.loads(data)
            return ConversationState(**state_dict)
        except Exception as e:
            logger.error(f"Failed to parse session {session_id}: {e}")
            return None

    def update_session(self, state: ConversationState) -> bool:
        """세션 업데이트"""
        state.updated_at = datetime.utcnow().isoformat()
        return self._save_state(state)

    def delete_session(self, session_id: str) -> bool:
        """세션 삭제"""
        key = self._get_key(session_id)
        return self.redis.delete(key) > 0

    def _save_state(self, state: ConversationState) -> bool:
        """상태 저장"""
        key = self._get_key(state.session_id)
        try:
            data = state.model_dump_json()
            self.redis.setex(key, self.ttl, data)
            return True
        except Exception as e:
            logger.error(f"Failed to save session {state.session_id}: {e}")
            return False

    # =========================================================================
    # State Manipulation
    # =========================================================================

    def set_intent(self, session_id: str, intent: str) -> bool:
        """현재 Intent 설정"""
        state = self.get_session(session_id)
        if not state:
            return False

        state.current_intent = intent
        return self.update_session(state)

    def set_current_node(self, session_id: str, node_id: str) -> bool:
        """현재 노드 ID 설정"""
        state = self.get_session(session_id)
        if not state:
            return False

        state.current_node_id = node_id
        return self.update_session(state)

    def set_value(self, session_id: str, key: str, value: Any) -> bool:
        """조건값 설정"""
        state = self.get_session(session_id)
        if not state:
            return False

        state.collected_values[key] = value
        return self.update_session(state)

    def get_value(self, session_id: str, key: str) -> Optional[Any]:
        """조건값 조회"""
        state = self.get_session(session_id)
        if not state:
            return None

        return state.collected_values.get(key)

    def get_all_values(self, session_id: str) -> Dict[str, Any]:
        """모든 조건값 조회"""
        state = self.get_session(session_id)
        if not state:
            return {}

        return state.collected_values

    def set_document_context(self, session_id: str, document_id: str) -> bool:
        """문서 컨텍스트 설정"""
        state = self.get_session(session_id)
        if not state:
            return False

        state.document_context = document_id
        return self.update_session(state)

    # =========================================================================
    # Conversation History
    # =========================================================================

    def add_message(
        self,
        session_id: str,
        role: str,
        content: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> bool:
        """대화 히스토리에 메시지 추가"""
        state = self.get_session(session_id)
        if not state:
            return False

        message = {
            "role": role,
            "content": content,
            "timestamp": datetime.utcnow().isoformat(),
        }
        if metadata:
            message["metadata"] = metadata

        state.conversation_history.append(message)

        # 히스토리 크기 제한 (최근 50개)
        if len(state.conversation_history) > 50:
            state.conversation_history = state.conversation_history[-50:]

        return self.update_session(state)

    def get_history(self, session_id: str, limit: int = 10) -> List[Dict[str, str]]:
        """대화 히스토리 조회"""
        state = self.get_session(session_id)
        if not state:
            return []

        return state.conversation_history[-limit:]

    def get_history_for_llm(self, session_id: str, limit: int = 10) -> str:
        """LLM에 전달할 형식으로 히스토리 포맷팅"""
        history = self.get_history(session_id, limit)

        formatted = []
        for msg in history:
            role = "사용자" if msg["role"] == "user" else "상담원"
            formatted.append(f"{role}: {msg['content']}")

        return "\n".join(formatted)

    # =========================================================================
    # Session Management
    # =========================================================================

    def extend_session(self, session_id: str, additional_seconds: int = 3600) -> bool:
        """세션 만료 시간 연장"""
        key = self._get_key(session_id)
        current_ttl = self.redis.ttl(key)

        if current_ttl < 0:
            return False

        new_ttl = current_ttl + additional_seconds
        return self.redis.expire(key, new_ttl)

    def get_session_ttl(self, session_id: str) -> int:
        """세션 남은 시간(초) 조회"""
        key = self._get_key(session_id)
        return self.redis.ttl(key)

    def list_active_sessions(self, limit: int = 100) -> List[str]:
        """활성 세션 목록 조회"""
        pattern = f"{self.SESSION_PREFIX}*"
        keys = self.redis.keys(pattern)
        session_ids = [key.replace(self.SESSION_PREFIX, "") for key in keys[:limit]]
        return session_ids

    def cleanup_expired(self) -> int:
        """만료된 세션 정리 (Redis가 자동으로 처리하지만 명시적 호출용)"""
        # Redis TTL이 자동으로 처리하므로 실제로는 필요 없음
        # 필요시 추가 정리 로직
        return 0

    # =========================================================================
    # Convenience Methods
    # =========================================================================

    def get_or_create_session(self, session_id: Optional[str] = None) -> ConversationState:
        """세션 조회 또는 생성"""
        if session_id:
            state = self.get_session(session_id)
            if state:
                return state

        return self.create_session()

    def reset_session(self, session_id: str) -> Optional[ConversationState]:
        """세션 초기화 (히스토리 유지, 조건값 초기화)"""
        state = self.get_session(session_id)
        if not state:
            return None

        state.current_intent = None
        state.current_node_id = None
        state.collected_values = {}
        # conversation_history는 유지

        self.update_session(state)
        return state
