# app/zoom_client.py
from __future__ import annotations
from typing import Optional, Dict, Any, Callable
import time
import httpx
from .config import settings


def _pretty_zoom_error(resp: httpx.Response) -> str:
    """
    Devuelve detalle amigable del error de Zoom con el body JSON (message, code).
    """
    try:
        data = resp.json()
    except Exception:
        try:
            data = {"raw": resp.text}
        except Exception:
            data = {"raw": "<no-body>"}
    return f"{resp.status_code} {resp.reason_phrase} | {data}"


class ZoomClient:
    """
    Cliente Zoom con:
    - Cache de token (con expiración).
    - Retries para 401 (refresh) y 429 (rate limit).
    - Reglas claras para start_time y timezone:
        * Si start_time termina en 'Z' (UTC), NO se envía 'timezone'.
        * Si start_time NO termina en 'Z' (hora local), se envía 'timezone' si viene provisto.
    """
    _token: Optional[str] = None
    _token_exp_ts: float = 0.0  # epoch seconds cuando expira

    async def _get_token(self) -> str:
        account_id = settings.ZOOM_ACCOUNT_ID
        client_id = settings.ZOOM_CLIENT_ID
        client_secret = settings.ZOOM_CLIENT_SECRET
        if not (account_id and client_id and client_secret):
            raise RuntimeError("Faltan credenciales Zoom en .env (ZOOM_ACCOUNT_ID/CLIENT_ID/CLIENT_SECRET).")

        token_url = "https://zoom.us/oauth/token"
        auth = (client_id, client_secret)
        params = {"grant_type": "account_credentials", "account_id": account_id}

        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(token_url, params=params, auth=auth)
            resp.raise_for_status()
            data = resp.json()
            self._token = data["access_token"]
            # Resp suele traer "expires_in" (segundos). Reservamos un colchón de 60s.
            expires_in = int(data.get("expires_in", 3600))
            self._token_exp_ts = time.time() + max(0, expires_in - 60)
            return self._token

    async def _ensure_token(self) -> str:
        if not self._token or time.time() >= self._token_exp_ts:
            await self._get_token()
        return self._token  # type: ignore[return-value]

    async def _headers(self) -> dict:
        token = await self._ensure_token()
        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

    # -----------------------
    # Helpers payload
    # -----------------------
    @staticmethod
    def _payload_start_time(start_time_iso: str, timezone: Optional[str]) -> Dict[str, Any]:
        """
        Construye el par (start_time, timezone) para Zoom:
         - Si viene en UTC con 'Z', NO envía timezone (Zoom lo interpreta como UTC).
         - Si NO termina en 'Z' (ej. '2025-11-13T14:00:00'), se enviará timezone si fue provisto
           (ej. "America/Guayaquil"). Esto indica que la hora es local en esa zona.
        """
        payload: Dict[str, Any] = {"start_time": start_time_iso}
        if not start_time_iso.endswith("Z") and timezone:
            payload["timezone"] = timezone
        return payload

    async def _request_with_retry(
        self,
        method: Callable[..., Any],
        url: str,
        *,
        json: Optional[dict] = None,
    ) -> httpx.Response:
        """
        Hace 1 intento + reintento en:
          - 401: refresca token y reintenta una vez.
          - 429: espera 'Retry-After' (si viene) o 1.2s y reintenta una vez.
        Lanza RuntimeError si sigue fallando.
        """
        async with httpx.AsyncClient(timeout=20.0) as client:
            # Primer intento
            resp = await method(client, url, json=json, headers=await self._headers())
            if resp.status_code == 401:
                # Token viejo/invalidado → refrescar y reintentar
                self._token = None
                await self._ensure_token()
                resp = await method(client, url, json=json, headers=await self._headers())

            elif resp.status_code == 429:
                # Rate limit → esperar y reintentar una vez
                try:
                    retry_after = float(resp.headers.get("Retry-After", "1.2"))
                except Exception:
                    retry_after = 1.2
                await httpx.AsyncClient().aclose()  # nada crítico, solo para ser prolijos
                await httpx.AsyncClient(timeout=retry_after).aclose()
                resp = await method(client, url, json=json, headers=await self._headers())

            return resp

    # -----------------------
    # API Calls
    # -----------------------
    async def create_meeting(
        self,
        user_id: str,
        topic: str,
        start_time_iso: str,        # REGLA: si termina en 'Z' = UTC; si no, interpreta como hora local
        duration_minutes: int,
        timezone: Optional[str] = None,   # se envía solo si start_time NO termina en 'Z'
        waiting_room: bool = True,
        join_before_host: bool = False,
        passcode: Optional[str] = None,
    ) -> dict:
        """
        Crea una reunión (type=2).
        - Si envías UTC con 'Z', NO mandes timezone.
        - Si envías hora local (sin 'Z'), manda timezone (p.ej. "America/Guayaquil").
        Con tu flujo actual (payments.py) envías hora local GYE y timezone="America/Guayaquil".
        """
        api_base = settings.ZOOM_API_BASE.rstrip("/")
        url = f"{api_base}/users/{user_id}/meetings"

        payload: Dict[str, Any] = {
            "topic": topic,
            "type": 2,  # scheduled
            "duration": duration_minutes,
            "settings": {
                "waiting_room": waiting_room,
                "join_before_host": join_before_host,
                "approval_type": 2,
                "mute_upon_entry": True,
                "participant_video": False,
                "host_video": False,
            },
        }
        payload.update(self._payload_start_time(start_time_iso, timezone))
        if passcode:
            payload["password"] = passcode

        def _post(client: httpx.AsyncClient, u: str, **kw) -> Any:
            return client.post(u, **kw)

        resp = await self._request_with_retry(_post, url, json=payload)
        if resp.status_code >= 400:
            raise RuntimeError(f"zoom.create_meeting: {_pretty_zoom_error(resp)}")
        return resp.json()

    async def update_meeting(
        self,
        meeting_id: str,
        start_time_iso: str,       # REGLA: si termina en 'Z' = UTC; si no, hora local
        duration_minutes: int,
        topic: Optional[str] = None,
        timezone: Optional[str] = None,   # se envía solo si start_time NO termina en 'Z'
    ) -> None:
        """
        PATCH /meetings/{meetingId}
        Zoom devuelve 204 No Content en éxito.
        """
        api_base = settings.ZOOM_API_BASE.rstrip("/")
        url = f"{api_base}/meetings/{meeting_id}"

        payload: Dict[str, Any] = {"duration": duration_minutes}
        payload.update(self._payload_start_time(start_time_iso, timezone))
        if topic:
            payload["topic"] = topic

        def _patch(client: httpx.AsyncClient, u: str, **kw) -> Any:
            return client.patch(u, **kw)

        resp = await self._request_with_retry(_patch, url, json=payload)
        if resp.status_code >= 400:
            raise RuntimeError(f"zoom.update_meeting: {_pretty_zoom_error(resp)}")
        # 204 OK → nada que retornar

    async def get_meeting(self, meeting_id: str) -> dict:
        api_base = settings.ZOOM_API_BASE.rstrip("/")
        url = f"{api_base}/meetings/{meeting_id}"

        def _get(client: httpx.AsyncClient, u: str, **kw) -> Any:
            return client.get(u, **kw)

        resp = await self._request_with_retry(_get, url)
        if resp.status_code >= 400:
            raise RuntimeError(f"zoom.get_meeting: {_pretty_zoom_error(resp)}")
        return resp.json()


zoom = ZoomClient()
