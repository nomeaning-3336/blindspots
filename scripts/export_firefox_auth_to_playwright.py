import configparser
import json
import os
import shutil
import sqlite3
import tempfile
from pathlib import Path


TARGET_HOST_SNIPPETS = (
    "localhost",
    "127.0.0.1",
)


def firefox_profiles_ini() -> Path:
    return Path(os.environ["APPDATA"]) / "Mozilla" / "Firefox" / "profiles.ini"


def resolve_default_firefox_profile() -> Path:
    ini_path = firefox_profiles_ini()
    parser = configparser.RawConfigParser()
    parser.read(ini_path)
    install_section = next(
        (name for name in parser.sections() if name.startswith("Install")),
        None,
    )
    relative_path = ""
    if install_section and parser.has_option(install_section, "Default"):
        relative_path = parser.get(install_section, "Default").strip()
    if not relative_path:
        for section in parser.sections():
            if not section.startswith("Profile"):
                continue
            if parser.has_option(section, "Default") and parser.get(section, "Default").strip() == "1":
                relative_path = parser.get(section, "Path").strip()
                break
    if not relative_path:
        raise RuntimeError("Could not locate the default Firefox profile.")
    return (ini_path.parent / relative_path).resolve()


def same_site_value(raw_value: int) -> str | None:
    mapping = {
        0: None,
        1: "Lax",
        2: "Strict",
        3: "None",
    }
    return mapping.get(int(raw_value), None)


def normalize_expiry(raw_value: int | float | None) -> int:
    if raw_value is None:
        return -1
    expiry = int(raw_value)
    if expiry <= 0:
        return -1
    if expiry > 10_000_000_000:
        expiry //= 1000
    return expiry


def cookie_matches(host: str) -> bool:
    normalized = host.lower()
    return any(part in normalized for part in TARGET_HOST_SNIPPETS)


def export_cookies(profile_dir: Path) -> list[dict]:
    source_db = profile_dir / "cookies.sqlite"
    if not source_db.exists():
        raise RuntimeError(f"Firefox cookie database not found: {source_db}")

    with tempfile.NamedTemporaryFile(delete=False, suffix=".sqlite") as tmp_file:
        tmp_path = Path(tmp_file.name)
    try:
        shutil.copy2(source_db, tmp_path)
        connection = sqlite3.connect(tmp_path)
        cursor = connection.cursor()
        cursor.execute(
            """
            SELECT host, name, value, path, expiry, isSecure, isHttpOnly, sameSite
            FROM moz_cookies
            ORDER BY host, name
            """
        )
        cookies = []
        for host, name, value, path, expiry, is_secure, is_http_only, same_site in cursor.fetchall():
            if not cookie_matches(str(host or "")):
                continue
            cookie = {
                "name": str(name),
                "value": str(value),
                "domain": str(host),
                "path": str(path or "/"),
                "expires": normalize_expiry(expiry),
                "httpOnly": bool(is_http_only),
                "secure": bool(is_secure),
            }
            mapped_same_site = same_site_value(int(same_site or 0))
            if mapped_same_site:
                cookie["sameSite"] = mapped_same_site
            cookies.append(cookie)
        connection.close()
        return cookies
    finally:
        try:
            tmp_path.unlink(missing_ok=True)
        except OSError:
            pass


def main() -> None:
    profile_dir = resolve_default_firefox_profile()
    cookies = export_cookies(profile_dir)
    output = {
        "cookies": cookies,
        "origins": [],
    }
    output_path = Path("tmp") / "playwright-auth.json"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(output, indent=2), encoding="utf-8")
    print(f"Firefox profile: {profile_dir}")
    print(f"Exported {len(cookies)} cookies to {output_path.resolve()}")


if __name__ == "__main__":
    main()
