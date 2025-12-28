"""
Patch to add to the END of datasets_document.py
"""

import json
from flask_restful import Resource
from controllers.console import api
from controllers.console.wraps import account_initialization_required, setup_required
from extensions.ext_redis import redis_client
from libs.login import login_required


class DocumentProgressApi(Resource):
    """API endpoint to get document processing progress from Redis."""

    @setup_required
    @login_required
    @account_initialization_required
    def get(self, dataset_id: str, document_id: str):
        """Get document processing progress."""
        progress_key = f"doc_progress:{document_id}"
        progress_data = redis_client.get(progress_key)

        if progress_data:
            try:
                data = json.loads(progress_data)
                return {
                    "document_id": str(document_id),
                    "stage": data.get("stage", "unknown"),
                    "progress": data.get("progress", 0),
                    "message": data.get("message", ""),
                    "total_pages": data.get("total_pages", 0),
                    "current_page": data.get("current_page", 0),
                    "updated_at": data.get("updated_at", "")
                }
            except json.JSONDecodeError:
                pass

        return {
            "document_id": str(document_id),
            "stage": "unknown",
            "progress": 0,
            "message": "No progress data available",
            "total_pages": 0,
            "current_page": 0,
            "updated_at": ""
        }


# Register the progress API endpoint
api.add_resource(
    DocumentProgressApi,
    "/datasets/<uuid:dataset_id>/documents/<uuid:document_id>/progress"
)
