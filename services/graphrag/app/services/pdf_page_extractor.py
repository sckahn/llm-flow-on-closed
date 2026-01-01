"""
PDF Page Extractor Service
Extracts page numbers from PDF files stored in MinIO/S3
Maps document segments to their source pages
"""
import logging
import os
import tempfile
from typing import Dict, List, Optional, Tuple
import boto3
from botocore.config import Config
import fitz  # PyMuPDF

logger = logging.getLogger(__name__)

# S3/MinIO configuration
S3_ENDPOINT = os.getenv("S3_ENDPOINT", "http://minio:9000")
S3_ACCESS_KEY = os.getenv("S3_ACCESS_KEY", "minioadmin")
S3_SECRET_KEY = os.getenv("S3_SECRET_KEY", "minio_llmflow")
S3_BUCKET = os.getenv("S3_BUCKET_NAME", "dify")
S3_REGION = os.getenv("S3_REGION", "us-east-1")


class PDFPageExtractor:
    """Extract page information from PDFs stored in S3/MinIO"""

    def __init__(self):
        self.s3_client = boto3.client(
            's3',
            endpoint_url=S3_ENDPOINT,
            aws_access_key_id=S3_ACCESS_KEY,
            aws_secret_access_key=S3_SECRET_KEY,
            region_name=S3_REGION,
            config=Config(signature_version='s3v4'),
        )
        self._page_cache: Dict[str, List[dict]] = {}

    def download_pdf(self, s3_key: str) -> Optional[str]:
        """Download PDF from S3 to temp file"""
        try:
            with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tmp:
                self.s3_client.download_fileobj(S3_BUCKET, s3_key, tmp)
                return tmp.name
        except Exception as e:
            logger.error(f"Failed to download PDF {s3_key}: {e}")
            return None

    def extract_pages(self, pdf_path: str) -> List[dict]:
        """Extract text from each page of PDF"""
        pages = []
        try:
            doc = fitz.open(pdf_path)
            for page_num in range(len(doc)):
                page = doc[page_num]
                text = page.get_text("text")
                pages.append({
                    "page_number": page_num + 1,  # 1-indexed
                    "text": text,
                    "text_length": len(text),
                    "word_count": len(text.split()),
                })
            doc.close()
            return pages
        except Exception as e:
            logger.error(f"Failed to extract pages from PDF: {e}")
            return []

    def get_page_info(self, s3_key: str) -> List[dict]:
        """Get page information for a PDF file (cached)"""
        if s3_key in self._page_cache:
            return self._page_cache[s3_key]

        pdf_path = self.download_pdf(s3_key)
        if not pdf_path:
            return []

        try:
            pages = self.extract_pages(pdf_path)
            self._page_cache[s3_key] = pages
            return pages
        finally:
            # Clean up temp file
            try:
                os.unlink(pdf_path)
            except:
                pass

    def find_page_for_text(
        self,
        s3_key: str,
        segment_text: str,
        min_match_ratio: float = 0.3,
    ) -> Optional[int]:
        """Find the page number where segment text appears"""
        pages = self.get_page_info(s3_key)
        if not pages:
            return None

        # Normalize text for comparison
        segment_words = set(segment_text.lower().split())
        if not segment_words:
            return None

        best_match_page = None
        best_match_ratio = 0.0

        for page_info in pages:
            page_words = set(page_info["text"].lower().split())
            if not page_words:
                continue

            # Calculate word overlap ratio
            common_words = segment_words & page_words
            match_ratio = len(common_words) / len(segment_words)

            if match_ratio > best_match_ratio and match_ratio >= min_match_ratio:
                best_match_ratio = match_ratio
                best_match_page = page_info["page_number"]

        return best_match_page

    def estimate_page_from_position(
        self,
        s3_key: str,
        segment_position: int,
        total_segments: int,
    ) -> Optional[int]:
        """Estimate page number based on segment position"""
        pages = self.get_page_info(s3_key)
        if not pages:
            return None

        total_pages = len(pages)
        if total_segments <= 0:
            return 1

        # Linear estimation
        estimated_page = int((segment_position / total_segments) * total_pages) + 1
        return min(estimated_page, total_pages)

    def build_segment_page_map(
        self,
        s3_key: str,
        segments: List[dict],
    ) -> Dict[str, int]:
        """Build mapping of segment indices to page numbers"""
        page_map = {}
        pages = self.get_page_info(s3_key)

        if not pages:
            return page_map

        total_pages = len(pages)
        total_segments = len(segments)

        # Build cumulative text length for page boundaries
        page_boundaries = []
        cumulative_length = 0
        for page in pages:
            cumulative_length += page["text_length"]
            page_boundaries.append(cumulative_length)

        total_text_length = cumulative_length

        # Calculate total segment text length
        total_seg_length = sum(len(seg.get("content", "")) for seg in segments)

        # Map segments to pages based on proportional position
        cumulative_seg_length = 0
        for i, seg in enumerate(segments):
            seg_id = str(seg.get("id", f"seg_{i}"))
            seg_text = seg.get("content", "")
            seg_length = len(seg_text)

            # Calculate midpoint of this segment's position
            seg_midpoint = cumulative_seg_length + (seg_length / 2)

            # Map to page based on proportional position
            if total_text_length > 0 and total_seg_length > 0:
                # Find which page this segment falls into
                # Map segment position ratio to PDF position ratio
                position_ratio = seg_midpoint / total_seg_length
                pdf_position = position_ratio * total_text_length

                estimated_page = 1
                for page_num, boundary in enumerate(page_boundaries, 1):
                    if pdf_position <= boundary:
                        estimated_page = page_num
                        break
                else:
                    estimated_page = total_pages

                page_map[str(i)] = estimated_page
                page_map[seg_id] = estimated_page
            else:
                # Simple linear estimation fallback
                estimated_page = min(int((i / max(total_segments, 1)) * total_pages) + 1, total_pages)
                page_map[str(i)] = estimated_page
                page_map[seg_id] = estimated_page

            cumulative_seg_length += seg_length

        return page_map

    def get_total_pages(self, s3_key: str) -> int:
        """Get total page count for a PDF"""
        pages = self.get_page_info(s3_key)
        return len(pages)

    def clear_cache(self):
        """Clear the page cache"""
        self._page_cache.clear()
