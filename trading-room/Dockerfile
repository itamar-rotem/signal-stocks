# Trading Room dashboard container.
# Build from inside trading-room/:  docker build -t trading-room .
# Run:  docker run -p 8501:8501 -v trading_data:/data trading-room
#
# The alert daemon can run as a second service from the same image:
#   docker run trading-room python alerts.py --daemon

FROM python:3.12-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

# Keep the SQLite state on a mountable volume so it survives restarts.
ENV TRADING_DB=/data/trading.db
RUN mkdir -p /data

EXPOSE 8501

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8501/_stcore/health')" || exit 1

# $PORT is injected by Railway/Render/Fly; default to 8501 locally.
CMD streamlit run dashboard.py \
    --server.address=0.0.0.0 \
    --server.port=${PORT:-8501} \
    --server.headless=true
