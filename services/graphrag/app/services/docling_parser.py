"""
Docling PDF Parser Service
High-quality PDF parsing using IBM Docling for Korean documents.
Replaces/supplements Dify's Unstructured OCR with better accuracy.
"""
import logging
import os
import tempfile
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
import boto3
from botocore.config import Config

logger = logging.getLogger(__name__)

# S3/MinIO configuration
S3_ENDPOINT = os.getenv("S3_ENDPOINT", "http://minio:9000")
S3_ACCESS_KEY = os.getenv("S3_ACCESS_KEY", "minioadmin")
S3_SECRET_KEY = os.getenv("S3_SECRET_KEY", "minio_llmflow")
S3_BUCKET = os.getenv("S3_BUCKET_NAME", "dify")
S3_REGION = os.getenv("S3_REGION", "us-east-1")


@dataclass
class DoclingChunk:
    """Represents a parsed chunk from Docling"""
    content: str
    page_number: int
    chunk_type: str  # text, table, heading, list, etc.
    heading: Optional[str] = None
    confidence: float = 1.0


class DoclingParser:
    """
    High-quality PDF parser using IBM Docling.
    Supports Korean OCR via EasyOCR backend.
    """

    def __init__(self, languages: List[str] = None):
        """
        Initialize Docling parser.

        Args:
            languages: OCR languages (default: ["ko", "en"] for Korean+English)
        """
        self.languages = languages or ["ko", "en"]
        self._converter = None
        self._s3_client = None
        self._initialized = False

    def _lazy_init(self):
        """Lazy initialization to avoid import overhead"""
        if self._initialized:
            return

        try:
            from docling.document_converter import DocumentConverter, PdfFormatOption
            from docling.datamodel.base_models import InputFormat
            from docling.datamodel.pipeline_options import PdfPipelineOptions, EasyOcrOptions

            # Configure OCR options for Korean
            ocr_options = EasyOcrOptions(lang=self.languages)

            # Configure PDF pipeline with OCR
            pdf_pipeline_options = PdfPipelineOptions(
                do_ocr=True,
                do_table_structure=True,
            )
            pdf_pipeline_options.ocr_options = ocr_options

            # Create converter with PDF-specific options
            self._converter = DocumentConverter(
                format_options={
                    InputFormat.PDF: PdfFormatOption(pipeline_options=pdf_pipeline_options)
                }
            )
            logger.info(f"Docling initialized with languages: {self.languages}")
            self._initialized = True

        except ImportError as e:
            logger.error(f"Docling not installed: {e}")
            raise RuntimeError("Docling is not installed. Run: pip install docling easyocr")
        except Exception as e:
            logger.error(f"Failed to initialize Docling: {e}")
            raise

    @property
    def s3_client(self):
        """Lazy S3 client initialization"""
        if self._s3_client is None:
            self._s3_client = boto3.client(
                's3',
                endpoint_url=S3_ENDPOINT,
                aws_access_key_id=S3_ACCESS_KEY,
                aws_secret_access_key=S3_SECRET_KEY,
                region_name=S3_REGION,
                config=Config(signature_version='s3v4'),
            )
        return self._s3_client

    def download_pdf(self, s3_key: str) -> Optional[str]:
        """Download PDF from S3/MinIO to temp file"""
        try:
            with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tmp:
                self.s3_client.download_fileobj(S3_BUCKET, s3_key, tmp)
                logger.info(f"Downloaded PDF: {s3_key} -> {tmp.name}")
                return tmp.name
        except Exception as e:
            logger.error(f"Failed to download PDF {s3_key}: {e}")
            return None

    def parse_pdf(self, pdf_path: str, chunk_size: int = 1000) -> List[DoclingChunk]:
        """
        Parse PDF using Docling and return structured chunks.

        Args:
            pdf_path: Path to PDF file
            chunk_size: Target chunk size in characters

        Returns:
            List of DoclingChunk with content and metadata
        """
        self._lazy_init()

        try:
            result = self._converter.convert(pdf_path)
            doc = result.document

            chunks = []
            current_chunk = ""
            current_page = 1
            current_heading = None

            # Export to markdown for structured parsing
            md_content = doc.export_to_markdown()

            # Also get page-level information
            pages_info = self._extract_page_info(doc)

            # Parse markdown into chunks with page tracking
            lines = md_content.split('\n')
            for line in lines:
                # Track headings
                if line.startswith('#'):
                    if current_chunk.strip():
                        chunks.append(DoclingChunk(
                            content=current_chunk.strip(),
                            page_number=current_page,
                            chunk_type="text",
                            heading=current_heading,
                        ))
                        current_chunk = ""
                    current_heading = line.lstrip('#').strip()
                    chunks.append(DoclingChunk(
                        content=line,
                        page_number=current_page,
                        chunk_type="heading",
                        heading=current_heading,
                    ))
                    continue

                # Track tables
                if line.startswith('|'):
                    if current_chunk.strip() and not current_chunk.strip().startswith('|'):
                        chunks.append(DoclingChunk(
                            content=current_chunk.strip(),
                            page_number=current_page,
                            chunk_type="text",
                            heading=current_heading,
                        ))
                        current_chunk = ""
                    current_chunk += line + "\n"
                    continue

                # Regular text - accumulate until chunk_size
                current_chunk += line + "\n"

                if len(current_chunk) >= chunk_size:
                    # Find a good break point
                    break_point = self._find_break_point(current_chunk, chunk_size)

                    chunks.append(DoclingChunk(
                        content=current_chunk[:break_point].strip(),
                        page_number=current_page,
                        chunk_type="text",
                        heading=current_heading,
                    ))
                    current_chunk = current_chunk[break_point:]

            # Don't forget the last chunk
            if current_chunk.strip():
                chunk_type = "table" if current_chunk.strip().startswith('|') else "text"
                chunks.append(DoclingChunk(
                    content=current_chunk.strip(),
                    page_number=current_page,
                    chunk_type=chunk_type,
                    heading=current_heading,
                ))

            # Assign page numbers based on content distribution
            if pages_info:
                chunks = self._assign_page_numbers(chunks, pages_info)

            logger.info(f"Parsed PDF into {len(chunks)} chunks")
            return chunks

        except Exception as e:
            logger.error(f"Failed to parse PDF {pdf_path}: {e}")
            raise

    def _extract_page_info(self, doc) -> List[Dict]:
        """Extract page-level information from Docling document"""
        pages_info = []
        try:
            # Try to get page boundaries from document structure
            if hasattr(doc, 'pages'):
                for i, page in enumerate(doc.pages):
                    page_text = ""
                    if hasattr(page, 'text'):
                        page_text = page.text
                    elif hasattr(page, 'get_text'):
                        page_text = page.get_text()
                    pages_info.append({
                        "page_number": i + 1,
                        "text": page_text,
                        "text_length": len(page_text),
                    })
        except Exception as e:
            logger.debug(f"Could not extract page info: {e}")
        return pages_info

    def _assign_page_numbers(self, chunks: List[DoclingChunk], pages_info: List[Dict]) -> List[DoclingChunk]:
        """Assign page numbers to chunks based on text distribution"""
        if not pages_info:
            return chunks

        total_text_length = sum(p["text_length"] for p in pages_info)
        if total_text_length == 0:
            return chunks

        # Build cumulative length boundaries
        page_boundaries = []
        cumulative = 0
        for page in pages_info:
            cumulative += page["text_length"]
            page_boundaries.append((page["page_number"], cumulative))

        # Assign page numbers based on position
        chunk_position = 0
        for chunk in chunks:
            chunk_midpoint = chunk_position + len(chunk.content) / 2

            # Find which page this chunk falls into
            relative_position = (chunk_midpoint / sum(len(c.content) for c in chunks)) * total_text_length

            for page_num, boundary in page_boundaries:
                if relative_position <= boundary:
                    chunk.page_number = page_num
                    break

            chunk_position += len(chunk.content)

        return chunks

    def _find_break_point(self, text: str, target_size: int) -> int:
        """Find a good break point near target_size (sentence or paragraph boundary)"""
        if len(text) <= target_size:
            return len(text)

        # Look for paragraph break first
        para_break = text.rfind('\n\n', 0, target_size + 200)
        if para_break > target_size * 0.7:
            return para_break + 2

        # Look for sentence break
        for sep in ['. ', '。', '.\n', '\n']:
            sent_break = text.rfind(sep, 0, target_size + 100)
            if sent_break > target_size * 0.7:
                return sent_break + len(sep)

        # Fallback to target_size
        return target_size

    def parse_from_s3(self, s3_key: str, chunk_size: int = 1000) -> List[DoclingChunk]:
        """
        Download and parse PDF from S3/MinIO.

        Args:
            s3_key: S3 key for the PDF file
            chunk_size: Target chunk size in characters

        Returns:
            List of DoclingChunk with content and metadata
        """
        pdf_path = self.download_pdf(s3_key)
        if not pdf_path:
            raise RuntimeError(f"Failed to download PDF: {s3_key}")

        try:
            return self.parse_pdf(pdf_path, chunk_size)
        finally:
            # Clean up temp file
            try:
                os.unlink(pdf_path)
            except:
                pass

    def get_full_text(self, s3_key: str) -> str:
        """
        Get full text content from PDF.

        Args:
            s3_key: S3 key for the PDF file

        Returns:
            Full text content as string
        """
        chunks = self.parse_from_s3(s3_key, chunk_size=10000)
        return "\n\n".join(chunk.content for chunk in chunks)

    def get_markdown(self, s3_key: str) -> str:
        """
        Get PDF content as formatted markdown.

        Args:
            s3_key: S3 key for the PDF file

        Returns:
            Markdown formatted content
        """
        pdf_path = self.download_pdf(s3_key)
        if not pdf_path:
            raise RuntimeError(f"Failed to download PDF: {s3_key}")

        try:
            self._lazy_init()
            result = self._converter.convert(pdf_path)
            return result.document.export_to_markdown()
        finally:
            try:
                os.unlink(pdf_path)
            except:
                pass


# Singleton instance for reuse
_parser_instance: Optional[DoclingParser] = None


def get_docling_parser(languages: List[str] = None) -> DoclingParser:
    """Get or create DoclingParser singleton"""
    global _parser_instance
    if _parser_instance is None:
        _parser_instance = DoclingParser(languages=languages)
    return _parser_instance
