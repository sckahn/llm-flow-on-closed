"""
Document Progress API - Returns real-time progress from Redis
Add this to controllers/console/datasets/
"""
import json
from flask import Blueprint
from flask_restful import Resource, Api

from controllers.console import api
from controllers.console.wraps import (
    account_initialization_required,
    setup_required,
)
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
                    "document_id": document_id,
                    "stage": data.get("stage", "unknown"),
                    "progress": data.get("progress", 0),
                    "message": data.get("message", ""),
                    "total_pages": data.get("total_pages", 0),
                    "current_page": data.get("current_page", 0),
                    "updated_at": data.get("updated_at", "")
                }
            except json.JSONDecodeError:
                pass

        # No progress data found - return default
        return {
            "document_id": document_id,
            "stage": "unknown",
            "progress": 0,
            "message": "No progress data available",
            "total_pages": 0,
            "current_page": 0,
            "updated_at": ""
        }


class DocumentsProgressApi(Resource):
    """API endpoint to get progress for multiple documents."""

    @setup_required
    @login_required
    @account_initialization_required
    def get(self, dataset_id: str):
        """Get progress for all documents in a dataset."""
        from flask import request
        document_ids = request.args.get("document_ids", "").split(",")
        document_ids = [d.strip() for d in document_ids if d.strip()]

        results = {}
        for doc_id in document_ids:
            progress_key = f"doc_progress:{doc_id}"
            progress_data = redis_client.get(progress_key)

            if progress_data:
                try:
                    data = json.loads(progress_data)
                    results[doc_id] = {
                        "stage": data.get("stage", "unknown"),
                        "progress": data.get("progress", 0),
                        "message": data.get("message", ""),
                        "updated_at": data.get("updated_at", "")
                    }
                except json.JSONDecodeError:
                    results[doc_id] = None
            else:
                results[doc_id] = None

        return {"data": results}


# Register API endpoints
api.add_resource(
    DocumentProgressApi,
    "/datasets/<uuid:dataset_id>/documents/<uuid:document_id>/progress"
)
api.add_resource(
    DocumentsProgressApi,
    "/datasets/<uuid:dataset_id>/documents-progress"
)
