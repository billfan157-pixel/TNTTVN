#!/bin/sh
set -e

# Volume mount (/app/data) do Railway tạo với owner mặc định (root) và CHE PHỦ
# thư mục đã chown trong image → nếu chạy trực tiếp dưới appuser thì SQLite
# không mở được DB (SQLITE_CANTOPEN). Cấp lại quyền trước khi chuyển user.
if [ -d /app/data ]; then
  chown -R appuser:appgroup /app/data
fi

exec su-exec appuser:appgroup node server/dist/index.js
