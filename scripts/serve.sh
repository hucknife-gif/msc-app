#!/bin/bash
# Serve the MSC app on the local network for iPhone install.
cd "$(dirname "$0")/../app" || exit 1
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "localhost")
echo "MSC app serving at:  http://$IP:8642"
echo "On your iPhone (same Wi-Fi): open that URL in Safari, then Share → Add to Home Screen."
python3 -m http.server 8642
