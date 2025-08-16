# -------- Base image --------
FROM python:3.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# runtime libs for numpy/pandas wheels
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 curl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# -------- Install deps --------
COPY requirements.txt /app/requirements.txt
RUN pip install --upgrade pip && pip install -r requirements.txt

# -------- App code --------
COPY . /app

# Ensure folders exist (FastAPI mounts)
RUN mkdir -p /app/data /app/static /app/templates

EXPOSE 8000

# -------- Run --------
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
