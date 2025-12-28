import logging

from core.rag.extractor.extractor_base import BaseExtractor
from core.rag.models.document import Document

logger = logging.getLogger(__name__)


class UnstructuredPDFExtractor(BaseExtractor):
    """Load pdf files.


    Args:
        file_path: Path to the file to load.

        api_url: Unstructured API URL

        api_key: Unstructured API Key
    """

    def __init__(self, file_path: str, api_url: str, api_key: str):
        """Initialize with file path."""
        self._file_path = file_path
        self._api_url = api_url
        self._api_key = api_key

    def extract(self) -> list[Document]:
        if self._api_url:
            from unstructured.partition.api import partition_via_api

            # Use hi_res strategy with Korean OCR for better text extraction
            elements = partition_via_api(
                filename=self._file_path,
                api_url=self._api_url,
                api_key=self._api_key,
                strategy="hi_res",  # Force OCR for scanned/embedded font PDFs
                languages=["kor", "eng"],  # Korean + English OCR
                pdf_infer_table_structure=True,
                hi_res_model_name="yolox",
            )
        else:
            from unstructured.partition.pdf import partition_pdf

            elements = partition_pdf(
                filename=self._file_path,
                strategy="hi_res",
                languages=["kor", "eng"],
                pdf_infer_table_structure=True,
            )

        from unstructured.chunking.title import chunk_by_title

        chunks = chunk_by_title(elements, max_characters=2000, combine_text_under_n_chars=2000)
        documents = []
        for chunk in chunks:
            text = chunk.text.strip()
            documents.append(Document(page_content=text))

        return documents
