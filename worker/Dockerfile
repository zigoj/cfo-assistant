FROM python:3.11-slim

# WeasyPrint system deps — package names for Debian Trixie (python:3.11-slim)
# libpango1.0-0 was renamed to libpango-1.0-0 in Trixie
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpango-1.0-0 \
    libharfbuzz0b \
    libfribidi0 \
    libcairo2 \
    libgdk-pixbuf-2.0-0 \
    shared-mime-info \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Don't run as root
RUN useradd -m worker
USER worker

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
