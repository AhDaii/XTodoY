"""本地预览原型：python design/scripts/serve.py [端口]，然后打开 http://127.0.0.1:5178/prototype/index.html

与 `python -m http.server` 相同，但禁用缓存，修改文件后刷新即可看到最新效果。
"""
import functools
import http.server
import sys
from pathlib import Path

DESIGN_DIR = Path(__file__).resolve().parents[1]


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5178
    handler = functools.partial(NoCacheHandler, directory=str(DESIGN_DIR))
    with http.server.ThreadingHTTPServer(("127.0.0.1", port), handler) as httpd:
        print(f"Serving {DESIGN_DIR} at http://127.0.0.1:{port}/prototype/index.html")
        httpd.serve_forever()


if __name__ == "__main__":
    main()
