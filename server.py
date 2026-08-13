# -*- coding: utf-8 -*-
"""
V次元 (bbs.lty.fan) 网页端后端代理
- WASM 签名 (K1/K2)
- JWT 自动刷新
- 可选 SafeLine sl_jwt_session cookie 透传
- 静态前端托管
"""
import os
import io
import sys
import json
import time
import struct
import ctypes
import threading
import logging

from flask import Flask, request, Response, send_from_directory

try:
    from curl_cffi import requests as creq
except ImportError:
    creq = None

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
API_BASE = os.environ.get("VCY_API_BASE", "https://bbs.lty.fan")
K1 = os.environ.get("VCY_K1", "")  # 源站签名参数名,自行获取
K2 = os.environ.get("VCY_K2", "")  # 源站签名时间戳参数名,自行获取
WASM_PATH = os.path.join(BASE_DIR, "eo_sign_wasm_bg.wasm")
CONFIG_PATH = os.path.join(BASE_DIR, "config.json")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("vcy")

# ---------------- 签名(MD5(secret + path + ts),纯 Python) ----------------
import hashlib as _hashlib

SIGN_SECRET = os.environ.get("VCY_SIGN_SECRET", "")  # 源站签名密钥,自行获取


def _sign(path: str, ts: int) -> str:
    """MD5(SIGN_SECRET + path + ts) -> 32 hex,纯 Python 无并发问题"""
    return _hashlib.md5(f"{SIGN_SECRET}{path}{ts}".encode()).hexdigest()


# ---------------- POW 验证码(天爱) ----------------
# POW 破解算法已移除(逆向成果不开源)。
def _solve_pow_captcha(scene: str = "login"):
    """天爱 POW 验证码求解(已移除,需自行实现或对接人工验证)"""
    return None, None


# ---------------- 配置 / 令牌 ----------------
_cfg = {}
_cfg_lock = threading.Lock()


def _load_cfg():
    with _cfg_lock:
        global _cfg
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                _cfg = json.load(f)
        except Exception as e:
            log.error("config load failed: %s", e)
            _cfg = {}


def _save_cfg():
    with _cfg_lock:
        try:
            with open(CONFIG_PATH, "w", encoding="utf-8") as f:
                json.dump(_cfg, f, ensure_ascii=False, indent=2)
        except Exception as e:
            log.error("config save failed: %s", e)


def _jwt():
    return _cfg.get("access_token", "")


def _refresh():
    rt = _cfg.get("refresh_token")
    if not rt:
        log.warning("no refresh_token")
        return False
    try:
        resp = _api_raw("/auth/refresh", {}, "POST", rt)
        if resp.status_code != 200:
            log.warning("refresh failed: %s %s", resp.status_code, resp.text[:200])
            return False
        data = resp.json().get("data", {})
        _cfg["access_token"] = data.get("access_token", "")
        _cfg["refresh_token"] = data.get("refresh_token", rt)
        _save_cfg()
        log.info("JWT refreshed")
        return True
    except Exception as e:
        log.error("refresh error: %s", e)
        return False


# ---------------- EdgeOne 验证 ----------------
# EdgeOne tcaptcha 破解已移除(逆向成果不开源)。
# 公开版直接使用普通会话请求(无 EdgeOne 验证的站点可直接用)。
_simple_session = None
_simple_lock = threading.Lock()


def _eo_session():
    """普通 curl_cffi 会话(EdgeOne 求解已移除)"""
    global _simple_session
    with _simple_lock:
        if _simple_session is None:
            _simple_session = creq.Session(impersonate="chrome131_android")
        return _simple_session


def _eo_ensure_cookie():
    """EdgeOne cookie 验证(已移除)"""
    return False


# ---------------- API 请求 ----------------
def _api_raw(path, params, method="GET", jwt=None, body=None, headers=None):
    if creq is None:
        raise RuntimeError("curl_cffi not installed")
    if not path.startswith("/webapi/"):
        path = "/webapi/" + path.lstrip("/")
    ts = int(time.time())
    v1 = _sign(path, ts)
    q = "&".join(f"{k}={v}" for k, v in params.items())
    sep = "&" if q else ""
    url = f"{API_BASE}{path}?{q}{sep}{K1}={v1}&{K2}={ts}"
    hd = {
        "Accept": "application/json",
        "Origin": "https://bbs.lty.fan",
        "Referer": "https://bbs.lty.fan/",
        "x-device-model": "VCyWeb",
        "x-platform": "web",
    }
    if jwt:
        hd["Authorization"] = f"Bearer {jwt}"
    if headers:
        hd.update(headers)
    kw = dict(headers=hd, impersonate="chrome131_android", timeout=30)
    s = _eo_session()
    for attempt in range(3):
        if s is not None:
            if method == "POST":
                resp = s.post(url, **kw, json=body or {})
            elif method == "PUT":
                resp = s.put(url, **kw, json=body or {})
            elif method == "DELETE":
                resp = s.delete(url, **kw)
            else:
                resp = s.get(url, **kw)
        else:
            if method == "POST":
                resp = creq.post(url, **kw, json=body or {})
            elif method == "PUT":
                resp = creq.put(url, **kw, json=body or {})
            elif method == "DELETE":
                resp = creq.delete(url, **kw)
            else:
                resp = creq.get(url, **kw)
        ct = resp.headers.get("content-type", "")
        if resp.status_code == 200 and "json" in ct:
            return resp
        # EdgeOne 验证页 / 403 / 非 JSON -> 重新验证后重试
        t = ''
        try:
            t = resp.text
        except Exception:
            pass
        if ("Security Verification" in t[:3000] or "WTKkN" in t[:1500]
                or "sid=" in t[:2000] or resp.status_code in (403, 405, 567)
                or ("text/html" in ct and "json" not in ct)):
            import time as _t
            _t.sleep(0.5)
            if _eo_ensure_cookie():
                continue
        return resp
    return resp


def _request_jwt():
    """从请求头取 access_token(前端 localStorage 传入),无则返回空"""
    h = request.headers.get("Authorization", "")
    if h.startswith("Bearer "):
        return h[7:].strip()
    return ""


def _request_refresh():
    """从请求头取 refresh_token"""
    return request.headers.get("X-Refresh-Token", "").strip()


def _api(path, params, method="GET", body=None, jwt=None, refresh_token=None):
    """带自动刷新的一次调用(支持每用户 token)"""
    if jwt is None:
        jwt = _jwt()
    resp = _api_raw(path, params, method, jwt, body)
    if resp.status_code == 401:
        log.info("401 -> refresh and retry")
        if refresh_token and _refresh_with(refresh_token):
            resp = _api_raw(path, params, method, _jwt(), body)
    return resp


def _refresh_with(rt):
    """用指定 refresh_token 刷新,更新全局(备用)"""
    if not rt:
        return False
    try:
        resp = _api_raw(
            "/webapi/auth/refresh",
            {},
            method="POST",
            body={},
            headers={"Authorization": f"Bearer {rt}"},
        )
        if resp.status_code != 200:
            log.warning("refresh failed: %s %s", resp.status_code, resp.text[:200])
            return False
        data = resp.json().get("data", {})
        _cfg["access_token"] = data.get("access_token", "")
        _cfg["refresh_token"] = data.get("refresh_token", rt)
        _save_cfg()
        log.info("JWT refreshed")
        return True
    except Exception as e:
        log.error("refresh error: %s", e)
        return False


# ---------------- Flask ----------------
app = Flask(__name__, static_folder=None)
STATIC_DIR = os.path.join(BASE_DIR, "static")

AUTH_PATHS = None


def _load_auth_paths():
    """受保护端点列表,未登录时前端跳登录"""
    global AUTH_PATHS
    if AUTH_PATHS is None:
        try:
            with open(os.path.join(BASE_DIR, "auth_paths.json"), encoding="utf-8") as f:
                AUTH_PATHS = set(json.load(f))
        except Exception:
            AUTH_PATHS = set()
    return AUTH_PATHS


# ---------------- 置顶帖子 ----------------
_pin_cache = {"ts": 0, "data": []}
PIN_ADMIN_UID = 12507  # 有置顶管理权限的用户


def _pin_list():
    """返回未过期的置顶配置列表 [{tid, expire}]"""
    raw = _cfg.get("pin") or []
    if isinstance(raw, dict):  # 兼容旧格式 {tid, expire}
        raw = [raw]
    if not isinstance(raw, list):
        return []
    now = time.time()
    out = []
    for p in raw:
        if isinstance(p, dict) and p.get("tid") and (p.get("expire") or 0) > now:
            out.append(p)
    return out


def _pin_items():
    """获取所有置顶帖列表项(带 60s 缓存);未配置/过期/失败返回 []"""
    global _pin_cache
    pins = _pin_list()
    if not pins:
        _pin_cache = {"ts": 0, "data": []}
        return []
    now = time.time()
    if _pin_cache["data"] and now - _pin_cache["ts"] < 60:
        return _pin_cache["data"]
    items = []
    for pin in pins:
        tid = pin.get("tid")
        try:
            r = _api_raw(f"threads/{tid}", {}, jwt=_jwt())
            if r.status_code != 200:
                continue
            t = r.json().get("data") or {}
            if not t.get("tid"):
                continue
            items.append({
                "type": "thread",
                "tid": t.get("tid"),
                "fid": t.get("fid"),
                "subject": t.get("subject"),
                "authorid": t.get("authorid"),
                "author": t.get("author"),
                "avatar": t.get("avatar") or t.get("author_avatar"),
                "author_avatar": t.get("author_avatar") or t.get("avatar"),
                "groupname": t.get("groupname"),
                "forum_name": t.get("forum_name"),
                "dateline": t.get("dateline"),
                "lastpost": t.get("lastpost"),
                "lastposter": t.get("lastposter"),
                "views": t.get("views"),
                "replies": t.get("replies"),
                "likes": t.get("likes"),
                "dislikes": t.get("dislikes"),
                "digest": t.get("digest"),
                "message": t.get("message"),
                "images": t.get("images") or [],
                "attachments": t.get("attachments") or [],
                "pin": 1,
            })
        except Exception as e:
            log.warning("pin fetch failed: %s", e)
    _pin_cache = {"ts": now, "data": items}
    return items


def _inject_pin(data_bytes):
    """向 threads/homepage 列表 JSON 注入置顶项(仅第 1 页);返回新 bytes"""
    if not data_bytes:
        return data_bytes
    pin_items = _pin_items()
    if not pin_items:
        return data_bytes
    try:
        d = json.loads(data_bytes.decode("utf-8", "replace"))
    except Exception:
        return data_bytes
    dd = d.get("data") if isinstance(d, dict) else None
    if not isinstance(dd, dict):
        return data_bytes
    lst = dd.get("threads")
    if not isinstance(lst, list):
        lst = dd.get("list")
    if not isinstance(lst, list):
        return data_bytes
    if not lst:
        return data_bytes
    # 从列表中移除已存在的置顶帖,再按配置顺序插到头部
    pin_tids = {x.get("tid") for x in pin_items}
    filtered = [x for x in lst if not (isinstance(x, dict) and x.get("tid") in pin_tids)]
    out = list(pin_items) + filtered
    if dd.get("threads") is lst:
        dd["threads"] = out
    else:
        dd["list"] = out
    return json.dumps(d, ensure_ascii=False).encode("utf-8")


# ---------------- 排行榜 ----------------
_rank_cache = {"ts": 0, "total": [], "week": []}
_likes_cache = {}
RANK_PAGES = 2
RANK_SIZE = 100
RANK_TTL = 3600  # 1 小时更新一次
RANK_W = {"view": 1, "like": 3, "reply": 5}  # 综合分 = 浏览*1 + 点赞*3 + 评论*5


def _build_all():
    """抓取一次, 同时构建 total + week 两个榜"""
    seen = {}
    for p in range(1, RANK_PAGES + 1):
        try:
            r = _api_raw("threads", {"page": p, "pageSize": RANK_SIZE}, jwt=_jwt())
            if r.status_code != 200:
                continue
            for t in (r.json().get("data") or {}).get("threads") or []:
                tid = t.get("tid")
                if not tid or tid in seen:
                    continue
                seen[tid] = t
        except Exception:
            continue
    now = time.time()
    total, week = [], []
    for t in seen.values():
        if t.get("pin"):
            continue
        dl = t.get("dateline") or 0
        views = int(t.get("views") or 0)
        likes = int(t.get("likes") or 0)
        replies = int(t.get("replies") or 0)
        score = views * RANK_W["view"] + likes * RANK_W["like"] + replies * RANK_W["reply"]
        row = {
            "tid": t.get("tid"),
            "subject": t.get("subject") or "",
            "author": t.get("author") or "",
            "authorid": t.get("authorid"),
            "forum_name": t.get("forum_name") or "",
            "fid": t.get("fid"),
            "digest": t.get("digest") or 0,
            "views": views,
            "likes": likes,
            "replies": replies,
            "score": score,
            "dateline": dl,
            "lastpost": t.get("lastpost") or 0,
        }
        total.append(row)
        if now - dl <= 7 * 86400:
            week.append(row)
    total.sort(key=lambda x: (-x["score"], -x["lastpost"]))
    week.sort(key=lambda x: (-x["score"], -x["lastpost"]))
    return total[:50], week[:50]


@app.route("/api/ranking")
def ranking():
    type_ = request.args.get("type", "total")
    if type_ not in ("total", "week"):
        type_ = "total"
    now = time.time()
    if now - _rank_cache["ts"] > RANK_TTL:
        try:
            total, week = _build_all()
            _rank_cache.update(ts=int(now), total=total, week=week)
        except Exception as e:
            log.exception("ranking build failed")
            if not _rank_cache["total"]:
                return Response(json.dumps({"status": "fail", "message": f"排行构建失败: {e}"}, ensure_ascii=False), 502, mimetype="application/json")
    items = _rank_cache["week"] if type_ == "week" else _rank_cache["total"]
    return Response(json.dumps({
        "status": "success",
        "data": {
            "type": type_,
            "updated_at": int(_rank_cache["ts"]),
            "ttl": RANK_TTL,
            "weight": {"views": RANK_W["view"], "likes": RANK_W["like"], "replies": RANK_W["reply"]},
            "items": items,
        }
    }, ensure_ascii=False), 200, mimetype="application/json")


@app.route("/api/pin-manage", methods=["GET", "POST", "DELETE"])
def pin_manage():
    """置顶管理(仅 PIN_ADMIN_UID):
    GET           -> 当前置顶列表 [{tid, expire, remain}]
    POST {tid, hours} -> 新增/更新置顶(hours 小时)
    DELETE {tid}  -> 取消置顶
    """
    me = _request_jwt()
    if me:
        try:
            jwt_payload = me.split(".")[1]
            import base64 as _b64
            pad = "=" * (-len(jwt_payload) % 4)
            payload = json.loads(_b64.urlsafe_b64decode(jwt_payload + pad).decode("utf-8", "replace"))
            uid = payload.get("uid") or payload.get("sub")
        except Exception:
            uid = None
    else:
        uid = None
    if int(uid or 0) != PIN_ADMIN_UID:
        return Response(json.dumps({"status": "fail", "message": "无权限"}, ensure_ascii=False), 403, mimetype="application/json")
    global _pin_cache

    if request.method == "GET":
        pins = _pin_list()
        now = time.time()
        return Response(json.dumps({"status": "success", "data": [
            {"tid": p["tid"], "expire": p["expire"], "remain_hours": round((p["expire"] - now) / 3600, 1)}
            for p in pins
        ]}, ensure_ascii=False), 200, mimetype="application/json")

    if request.method == "DELETE":
        body = request.get_json(silent=True) or {}
        tid = body.get("tid")
        if not tid:
            return Response(json.dumps({"status": "fail", "message": "缺少 tid"}, ensure_ascii=False), 400, mimetype="application/json")
        raw = _cfg.get("pin") or []
        if isinstance(raw, dict):
            raw = [raw]
        raw = [p for p in raw if not (isinstance(p, dict) and str(p.get("tid")) == str(tid))]
        _cfg["pin"] = raw
        _save_cfg()
        _pin_cache = {"ts": 0, "data": []}
        return Response(json.dumps({"status": "success", "message": "已取消置顶"}, ensure_ascii=False), 200, mimetype="application/json")

    body = request.get_json(silent=True) or {}
    tid = body.get("tid")
    hours = body.get("hours")
    try:
        hours = float(hours)
    except (TypeError, ValueError):
        hours = 0
    if not tid or hours <= 0:
        return Response(json.dumps({"status": "fail", "message": "tid 和 hours(小时) 必填"}, ensure_ascii=False), 400, mimetype="application/json")
    raw = _cfg.get("pin") or []
    if isinstance(raw, dict):
        raw = [raw]
    expire = int(time.time()) + int(hours * 3600)
    new_item = {"tid": int(tid), "expire": expire}
    raw = [p for p in raw if not (isinstance(p, dict) and str(p.get("tid")) == str(tid))]
    raw.append(new_item)
    _cfg["pin"] = raw
    _save_cfg()
    _pin_cache = {"ts": 0, "data": []}
    return Response(json.dumps({"status": "success", "message": f"已置顶, {hours:g} 小时后自动取消", "expire": expire}, ensure_ascii=False), 200, mimetype="application/json")


@app.route("/api/user/<int:uid>/likes")
def user_likes(uid):
    """统计用户全部帖子的获赞总数(遍历帖子列表累加, 10 分钟缓存)"""
    key = f"u{uid}"
    now = time.time()
    c = _likes_cache.get(key)
    if c and now - c[0] < 600:
        return Response(json.dumps({"status": "success", "data": {"uid": uid, "likes": c[1]}}, ensure_ascii=False), 200, mimetype="application/json")
    total = 0
    page = 1
    while page <= 10:
        try:
            r = _api_raw("threads", {"uid": uid, "page": page, "pageSize": 20}, jwt=_jwt())
            if r.status_code != 200:
                break
            ts = (r.json().get("data") or {}).get("threads") or []
            if not ts:
                break
            total += sum(int(t.get("likes") or 0) for t in ts)
            if len(ts) < 20:
                break
            page += 1
        except Exception as e:
            log.warning("user likes failed: %s", e)
            break
    _likes_cache[key] = (now, total)
    return Response(json.dumps({"status": "success", "data": {"uid": uid, "likes": total}}, ensure_ascii=False), 200, mimetype="application/json")


@app.route("/api/<path:api_path>", methods=["GET", "POST", "PUT", "DELETE"])
def proxy(api_path):
    path = "/webapi/" + api_path
    params = dict(request.args)
    body = request.get_json(silent=True) if request.method in ("POST", "PUT") else None
    method = request.method
    jwt = _request_jwt()
    refresh_token = _request_refresh()
    try:
        resp = _api(path, params, method, body, jwt=jwt, refresh_token=refresh_token)
    except Exception as e:
        return Response(f'{{"status":"fail","message":"proxy error: {e}"}}', 502, mimetype="application/json")

    ct = resp.headers.get("content-type", "application/json")
    out_headers = {
        "Content-Type": ct,
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
    }
    data = resp.content
    if method == "GET" and api_path in ("threads", "homepage") and not params.get("uid") and params.get("page", "1") in ("", "1"):
        try:
            data = _inject_pin(data)
        except Exception as e:
            log.warning("pin inject failed: %s", e)
    if resp.status_code == 403 and b"POW_MISSING" in data:
        data = json.dumps(
            {
                "status": "fail",
                "code": "POW_MISSING",
                "message": "网站安全系统(SafeLine 人机验证)要求先通过验证。请在浏览器访问一次 phpapi.lty.fan 完成人机验证,"
                "然后把 cookie 中的 sl_jwt_session 值填入本机 config.json 的 sl_jwt_session 字段后重启。",
            },
            ensure_ascii=False,
        ).encode()
        ct = "application/json; charset=utf-8"
        out_headers["Content-Type"] = ct
        return Response(data, 403, headers=out_headers)
    if resp.status_code == 403 and b"<!DOCTYPE html>" in data[:2000]:
        data = json.dumps(
            {
                "status": "fail",
                "code": "WAF_BLOCKED",
                "message": "服务器出口 IP 被网站防火墙(EdgeOne/SafeLine 人机验证)拦截,暂时无法获取数据。"
                "请网站管理员将服务器 IP 加入白名单,或稍后重试。",
            },
            ensure_ascii=False,
        ).encode()
        ct = "application/json; charset=utf-8"
        out_headers["Content-Type"] = ct
        return Response(data, 403, headers=out_headers)
    return Response(data, resp.status_code, headers=out_headers)


@app.route("/api/auth/login", methods=["POST"])
def auth_login():
    body = request.get_json(silent=True) or {}
    account = (body.get("account") or body.get("username") or "").strip()
    password = body.get("password") or ""
    if not account or not password:
        return Response(json.dumps({"status": "fail", "message": "请输入账号和密码"}, ensure_ascii=False), 400, mimetype="application/json")
    try:
        captcha_id, captcha_token = _solve_pow_captcha("login")
        if not captcha_id or not captcha_token:
            return Response(json.dumps({"status": "fail", "message": "人机验证获取失败,请重试"}, ensure_ascii=False), 200, mimetype="application/json")
        login_body = {
            "username": account,
            "password": password,
            "rememberMe": True,
            "captcha_provider": "tianai",
            "captcha_id": captcha_id,
            "captcha_token": captcha_token,
        }
        resp = _api_raw("/webapi/auth/login", {}, method="POST", body=login_body)
        try:
            data = resp.json()
        except Exception:
            data = {}
        d = data.get("data") or {}
        if resp.status_code == 200 and (d.get("access_token") or data.get("access_token")):
            at = d.get("access_token") or data.get("access_token")
            rt = d.get("refresh_token") or data.get("refresh_token") or ""
            _cfg["access_token"] = at
            if rt:
                _cfg["refresh_token"] = rt
            _save_cfg()
            return Response(json.dumps({
                "status": "success",
                "message": "登录成功",
                "access_token": at,
                "refresh_token": rt,
                "user": d.get("user") or data.get("user"),
            }, ensure_ascii=False), 200, mimetype="application/json")
        if resp.status_code == 428:
            msg = "需要人机验证,请重试"
        elif isinstance(data.get("data"), dict) and "username" in data["data"]:
            msg = data["data"]["username"]
        else:
            msg = data.get("message") or "登录失败"
        return Response(json.dumps({"status": "fail", "message": msg}, ensure_ascii=False), 200, mimetype="application/json")
    except Exception as e:
        return Response(json.dumps({"status": "fail", "message": f"登录出错: {e}"}, ensure_ascii=False), 502, mimetype="application/json")


@app.route("/api/auth/logout", methods=["POST"])
def auth_logout():
    _cfg["access_token"] = ""
    _cfg["refresh_token"] = ""
    _save_cfg()
    return Response(json.dumps({"status": "success", "message": "已退出登录"}, ensure_ascii=False), 200, mimetype="application/json")


@app.route("/api/auth/confirm", methods=["POST"])
def auth_confirm():
    """扫码登录确认:status 确认后拿 token"""
    body = request.get_json(silent=True) or {}
    tk = body.get("access_token") or ""
    if not tk:
        return Response(json.dumps({"status": "fail", "message": "no token"}, ensure_ascii=False), 400, mimetype="application/json")
    return Response(json.dumps({"status": "success", "message": "登录成功", "access_token": tk}, ensure_ascii=False), 200, mimetype="application/json")


@app.route("/api/auth/refresh", methods=["POST"])
def auth_refresh():
    """用前端传的 refresh_token 刷新"""
    rt = _request_refresh()
    if not rt:
        return Response(json.dumps({"ok": False, "message": "no refresh_token"}, ensure_ascii=False), 401, mimetype="application/json")
    try:
        resp = _api_raw(
            "/webapi/auth/refresh",
            {},
            method="POST",
            body={},
            headers={"Authorization": f"Bearer {rt}"},
        )
        if resp.status_code != 200:
            return Response(json.dumps({"ok": False, "message": "refresh failed"}, ensure_ascii=False), 401, mimetype="application/json")
        d = resp.json().get("data", {})
        return Response(json.dumps({
            "ok": True,
            "access_token": d.get("access_token", ""),
            "refresh_token": d.get("refresh_token", rt),
        }, ensure_ascii=False), 200, mimetype="application/json")
    except Exception as e:
        return Response(json.dumps({"ok": False, "message": str(e)}, ensure_ascii=False), 502, mimetype="application/json")


@app.route("/api/auth/status")
def auth_status():
    jwt = _request_jwt()
    ok = bool(jwt)
    me = None
    if ok:
        try:
            r = _api_raw("/webapi/user/me", {}, jwt=jwt)
            if r.status_code == 200:
                me = r.json().get("data")
        except Exception:
            pass
    return Response(json.dumps({"logged_in": bool(ok and me), "user": me}, ensure_ascii=False), 200, mimetype="application/json")


@app.route("/api/auth/refresh-now")
def refresh_now():
    return Response(json.dumps({"ok": _refresh()}, ensure_ascii=False), 200, mimetype="application/json")


_STREAM_CACHE = {}
_STREAM_CACHE_TTL = 15


@app.route("/api/video/stream/<int:vid>")
def video_stream(vid):
    """新版播放链路: detail(带 playback header) -> 腾讯 getplayinfo -> m3u8 URL
    登录用户用自己的 token(完整播放);游客用服务器全局 token(同样完整,绕开 30s 试看)"""
    now = time.time()
    hit = _STREAM_CACHE.get(vid)
    if hit and now - hit[0] < _STREAM_CACHE_TTL:
        return Response(json.dumps({"status": "success", "url": hit[1]}, ensure_ascii=False), 200, mimetype="application/json")
    import urllib.parse as _up
    import base64 as _b64
    jwt = _request_jwt()
    if not jwt:
        if _token_expired(_jwt()):
            _refresh_global_token()
        jwt = _jwt()
    for attempt in range(2):
        try:
            resp = _api_raw(
                f"/webapi/public/videos/{vid}/detail", {},
                jwt=jwt,
                headers={"X-Platform": "web", "X-App-Version": "1.0.0", "X-Playback-Source-Schema": "1"},
            )
            if resp.status_code != 200:
                return Response(resp.content, resp.status_code, headers={"Content-Type": "application/json"})
            d = resp.json().get("data") or {}
            bundle = d.get("playback_source_bundle") or {}
            sources = bundle.get("sources") or []
            if not sources:
                return Response(json.dumps({"status": "fail", "message": "该视频暂无可用播放源"}, ensure_ascii=False), 404, mimetype="application/json")
            cred = sources[0].get("credential") or {}
            app_id, file_id, sig = cred.get("app_id"), cred.get("file_id"), cred.get("signature")
            if not (app_id and file_id and sig):
                return Response(json.dumps({"status": "fail", "message": "播放凭证缺失"}, ensure_ascii=False), 404, mimetype="application/json")
            gp = _eo_session().get(
                f"https://playvideo.qcloud.com/getplayinfo/v4/{app_id}/{file_id}?psign={_up.quote(sig)}",
                impersonate="chrome131_android", timeout=30,
            )
            info = gp.json()
            murl = (info.get("media") or {}).get("streamingInfo", {}).get("plainOutput", {}).get("url", "")
            if not murl:
                return Response(json.dumps({"status": "fail", "message": "播放地址获取失败"}, ensure_ascii=False), 404, mimetype="application/json")
            if "exper=" in murl and not jwt:
                _refresh_global_token()
                jwt = _jwt()
                if jwt:
                    continue
            _STREAM_CACHE[vid] = (now, murl)
            return Response(json.dumps({"status": "success", "url": murl}, ensure_ascii=False), 200, mimetype="application/json")
        except Exception as e:
            log.exception("video_stream error")
            return Response(json.dumps({"status": "fail", "message": f"播放地址获取失败: {e}"}, ensure_ascii=False), 502, mimetype="application/json")
    return Response(json.dumps({"status": "fail", "message": "播放地址获取失败"}, ensure_ascii=False), 502, mimetype="application/json")


def _token_expired(tok):
    try:
        import base64 as _b64
        part = tok.split(".")[1]
        part += "=" * (-len(part) % 4)
        payload = json.loads(_b64.urlsafe_b64decode(part))
        return payload.get("exp", 0) < time.time() + 60
    except Exception:
        return True


def _refresh_global_token():
    """全局 token 失效时用配置账号重新登录并写回 config"""
    try:
        import threading
        with threading.Lock():
            if _jwt() and not _token_expired(_jwt()):
                return
            pid, ptok = _solve_pow_captcha(scene="login")
            body = {
                "username": os.environ.get("VCY_LOGIN_USER", ""),
                "password": os.environ.get("VCY_LOGIN_PASS", ""),
                "rememberMe": True,
                "captcha_provider": "tianai", "captcha_id": pid, "captcha_token": ptok,
            }
            r = _api_raw("/webapi/auth/login", {}, method="POST", body=body)
            d = r.json().get("data") or {}
            if d.get("access_token"):
                _cfg["access_token"] = d["access_token"]
                _cfg["refresh_token"] = d.get("refresh_token", "")
                _save_cfg()
    except Exception:
        log.exception("refresh global token failed")


SURVEY_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "surveys")


@app.route("/api/attach")
def attach_download():
    """代理下载 OSS 附件(同域输出, 支持强制下载)"""
    import urllib.parse as _up
    url = request.args.get("url", "")
    fn = request.args.get("fn", "")
    if not url:
        return Response(json.dumps({"status": "fail", "message": "缺少 url 参数"}, ensure_ascii=False), 400, mimetype="application/json")
    if not (url.startswith("https://oss.lty.fan/") or url.startswith("http://oss.lty.fan/")):
        return Response(json.dumps({"status": "fail", "message": "仅允许 oss.lty.fan 附件"}, ensure_ascii=False), 403, mimetype="application/json")
    try:
        gp = _eo_session().get(url, timeout=30)
        if gp.status_code != 200:
            return Response(json.dumps({"status": "fail", "message": f"附件拉取失败: {gp.status_code}"}, ensure_ascii=False), 502, mimetype="application/json")
        ct = gp.headers.get("Content-Type", "application/octet-stream") or "application/octet-stream"
        cd = "attachment"
        if fn:
            cd = f"attachment; filename*=UTF-8''{_up.quote(fn)}"
        return Response(gp.content, status=200,
                        headers={"Content-Type": ct, "Content-Disposition": cd})
    except Exception as e:
        log.exception("attach download error")
        return Response(json.dumps({"status": "fail", "message": f"附件下载失败: {e}"}, ensure_ascii=False), 502, mimetype="application/json")


def _send_survey_mail(record):
    """异步发送问卷提交通知邮件(失败仅记录日志,不影响主流程)"""
    import smtplib
    import ssl as _ssl
    from email.mime.text import MIMEText
    from email.header import Header

    smtp_cfg = _cfg.get("smtp", {})
    host = smtp_cfg.get("host", "smtp.163.com")
    port = int(smtp_cfg.get("port", 465))
    user = smtp_cfg.get("user", "")
    auth = smtp_cfg.get("auth", "")
    to = smtp_cfg.get("to", user)
    if not (user and auth):
        log.warning("smtp not configured, skip mail")
        return
    try:
        lines = [
            "V次元网站收到一份新的问卷提交：",
            "",
            "时间: %s" % time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(record.get("ts", 0))),
            "用户uid: %s" % (record.get("uid") or "(未登录)"),
            "",
            "回答内容:",
        ]
        for k, v in (record.get("answers") or {}).items():
            if isinstance(v, list):
                v = "、".join(str(x) for x in v)
            lines.append("  %s: %s" % (k, v))
        msg = MIMEText("\n".join(lines), "plain", "utf-8")
        msg["Subject"] = Header("V次元问卷新提交", "utf-8")
        msg["From"] = user
        msg["To"] = to
        ctx = _ssl.create_default_context()
        with smtplib.SMTP_SSL(host, port, context=ctx, timeout=20) as s:
            s.login(user, auth)
            s.sendmail(user, [to], msg.as_string())
        log.info("survey mail sent to %s", to)
    except Exception as e:
        log.exception("survey mail send failed: %s", e)


@app.route("/api/survey", methods=["GET", "POST"])
def survey():
    if request.method == "POST":
        try:
            body = request.get_json(silent=True) or {}
            answers = body.get("answers")
            if not isinstance(answers, dict):
                return Response(json.dumps({"status": "fail", "message": "answers 不能为空"}, ensure_ascii=False), 400, mimetype="application/json")
            os.makedirs(SURVEY_DIR, exist_ok=True)
            uid = request.headers.get("X-User-Id", "") or ""
            record = {
                "ts": int(time.time()),
                "uid": uid,
                "answers": answers,
            }
            fn = os.path.join(SURVEY_DIR, f"{int(time.time()*1000)}_{os.urandom(4).hex()}.json")
            with open(fn, "w", encoding="utf-8") as f:
                json.dump(record, f, ensure_ascii=False, indent=1)
            log.info("survey saved: %s", fn)
            threading.Thread(target=_send_survey_mail, args=(record,), daemon=True).start()
            return Response(json.dumps({"status": "success", "message": "提交成功，感谢参与！"}, ensure_ascii=False), 200, mimetype="application/json")
        except Exception as e:
            log.exception("survey save failed")
            return Response(json.dumps({"status": "fail", "message": str(e)}, ensure_ascii=False), 500, mimetype="application/json")
    try:
        os.makedirs(SURVEY_DIR, exist_ok=True)
        items = []
        for fn in sorted(os.listdir(SURVEY_DIR)):
            if not fn.endswith(".json"):
                continue
            try:
                with open(os.path.join(SURVEY_DIR, fn), "r", encoding="utf-8") as f:
                    items.append(json.load(f))
            except Exception:
                continue
        return Response(json.dumps({"status": "success", "data": items}, ensure_ascii=False), 200, mimetype="application/json")
    except Exception as e:
        return Response(json.dumps({"status": "fail", "message": str(e)}, ensure_ascii=False), 500, mimetype="application/json")


@app.route("/api/health")
def health():    return Response(json.dumps({"status": "ok", "token": bool(_jwt()), "wasm": os.path.exists(WASM_PATH)}, ensure_ascii=False), 200, mimetype="application/json")


@app.route("/")
def index():
    return send_from_directory(STATIC_DIR, "index.html")


@app.route("/<path:name>")
def static_files(name):
    return send_from_directory(STATIC_DIR, name)


def main():
    _load_cfg()
    port = int(os.environ.get("PORT", "8000"))
    host = os.environ.get("HOST", "0.0.0.0")
    log.info("V次元 web proxy on http://%s:%s", host, port)
    threading.Thread(target=_warm_ranking, daemon=True).start()
    app.run(host=host, port=port, threaded=True)


def _warm_ranking():
    """服务启动后台预热排行榜缓存(仅预热, 不影响请求处理)"""
    time.sleep(3)
    try:
        total, week = _build_all()
        _rank_cache.update(ts=int(time.time()), total=total, week=week)
        log.info("ranking warmed: total=%d week=%d", len(total), len(week))
    except Exception as e:
        log.warning("ranking warm failed: %s", e)


if __name__ == "__main__":
    main()
