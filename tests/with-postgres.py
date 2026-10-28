"""在专用临时 Postgres 上运行测试；CI 可以提供自己的临时连接。"""
import getpass
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
from urllib.parse import quote, urlparse


def run_tests(environment):
    return subprocess.run(["pnpm", "run", "test:packages"], env=environment).returncode


if "DATABASE_URL" in os.environ:
    connection = urlparse(os.environ["DATABASE_URL"])
    if connection.hostname not in ("localhost", "127.0.0.1") or connection.path != "/mykaoyan_test":
        sys.exit("测试只允许专用的本机 mykaoyan_test 临时库")
    tables = subprocess.check_output([
        "psql", "-XAt", "-v", "ON_ERROR_STOP=1", "-d", connection.geturl(), "-c",
        "select count(*) from pg_tables where schemaname not like 'pg_%' and schemaname <> 'information_schema'",
    ], text=True).strip()
    if tables != "0":
        sys.exit("集成测试需要新建的空库，不会清空已有学习数据")
    sys.exit(run_tests(os.environ))

if not all(shutil.which(command) for command in ("initdb", "pg_ctl", "createdb", "psql")):
    sys.exit("测试需要本机 Postgres 工具，或 CI 提供专用临时库的 DATABASE_URL")

with tempfile.TemporaryDirectory(prefix="mykaoyan-test-") as directory:
    data = Path(directory) / "data"
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    subprocess.run(["initdb", "-D", str(data), "-A", "trust", "--no-locale", "-E", "UTF8"],
                   check=True, stdout=subprocess.DEVNULL)
    subprocess.run(["pg_ctl", "-D", str(data), "-l", str(Path(directory) / "postgres.log"),
                    "-o", f"-h 127.0.0.1 -p {port} -k ''", "-w", "start"],
                   check=True, stdout=subprocess.DEVNULL)
    try:
        subprocess.run(["createdb", "-h", "127.0.0.1", "-p", str(port), "mykaoyan_test"], check=True)
        database = f"postgresql://{quote(getpass.getuser())}@127.0.0.1:{port}/mykaoyan_test"
        result = run_tests(dict(os.environ, DATABASE_URL=database))
    finally:
        subprocess.run(["pg_ctl", "-D", str(data), "-m", "fast", "-w", "stop"],
                       check=True, stdout=subprocess.DEVNULL)
    sys.exit(result)
