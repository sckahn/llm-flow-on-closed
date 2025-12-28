# Custom Dify API with document progress tracking and Unstructured PDF support
FROM langgenius/dify-api:0.11.0

# Copy patched IndexingRunner with progress tracking
COPY indexing_runner.py /app/api/core/indexing_runner.py

# Copy patched extract_processor to use UnstructuredPdfExtractor for PDFs
COPY extract_processor.py /app/api/core/rag/extractor/extract_processor.py

# Copy and append progress API to datasets_document.py
COPY document_progress_patch.py /tmp/document_progress_patch.py
RUN cat /tmp/document_progress_patch.py >> /app/api/controllers/console/datasets/datasets_document.py && \
    rm /tmp/document_progress_patch.py
