FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for Docling and EasyOCR
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    curl \
    # OpenCV dependencies for EasyOCR
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    # PDF processing
    libpoppler-cpp-dev \
    poppler-utils \
    # Fonts for Korean OCR
    fonts-nanum \
    fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app/ ./app/

# Set environment variables
ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1
# EasyOCR model cache directory
ENV EASYOCR_MODULE_PATH=/app/.easyocr
# Docling cache directory
ENV DOCLING_CACHE_DIR=/app/.docling

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Run the application
EXPOSE 8080
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
