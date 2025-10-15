# app/zoom_client.py
from __future__ import annotations
from typing import Optional, Dict, Any
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
    _token: Optional[str] = None

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
            return self._token

    async def _headers(self) -> dict:
        token = self._token or await self._get_token()
        return {"Authorization": f"Bearer {token}"}

    # -----------------------
    # Helpers payload
    # -----------------------
    @staticmethod
    def _payload_start_time(start_time_iso: str, timezone: Optional[str]) -> Dict[str, Any]:
        """
        Construye el par (start_time, timezone) para Zoom:
         - Si viene en UTC con 'Z', NO envía timezone.
         - Si viene sin 'Z' (ej. con offset -05:00), puede enviar timezone si se proveyó.
        """
        payload: Dict[str, Any] = {"start_time": start_time_iso}
        if not start_time_iso.endswith("Z") and timezone:
            payload["timezone"] = timezone
        return payload

    # -----------------------
    # API Calls
    # -----------------------
    async def create_meeting(
        self,
        user_id: str,
        topic: str,
        start_time_iso: str,     # preferimos UTC con 'Z'
        duration_minutes: int,
        timezone: Optional[str] = None,   # no se enviará si start_time termina en Z
        waiting_room: bool = True,
        join_before_host: bool = False,
        passcode: Optional[str] = None,
    ) -> dict:
        api_base = settings.ZOOM_API_BASE.rstrip("/")
        url = f"{api_base}/users/{user_id}/meetings"

        payload = {
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
        # start_time / timezone según reglas
        payload.update(self._payload_start_time(start_time_iso, timezone))

        if passcode:
            payload["password"] = passcode

        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(url, json=payload, headers=await self._headers())
            if resp.status_code == 401:
                self._token = None
                resp = await client.post(url, json=payload, headers=await self._headers())
            if resp.status_code >= 400:
                raise RuntimeError(f"zoom.create_meeting: {_pretty_zoom_error(resp)}")
            return resp.json()

    async def update_meeting(
        self,
        meeting_id: str,
        start_time_iso: str,      # preferimos UTC con 'Z'
        duration_minutes: int,
        topic: Optional[str] = None,
        timezone: Optional[str] = None,   # no se enviará si start_time termina en Z
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

        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.patch(url, json=payload, headers=await self._headers())
            if resp.status_code == 401:
                self._token = None
                resp = await client.patch(url, json=payload, headers=await self._headers())
            if resp.status_code >= 400:
                raise RuntimeError(f"zoom.update_meeting: {_pretty_zoom_error(resp)}")
            # 204 OK → nada que retornar

    async def get_meeting(self, meeting_id: str) -> dict:
        api_base = settings.ZOOM_API_BASE.rstrip("/")
        url = f"{api_base}/meetings/{meeting_id}"
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(url, headers=await self._headers())
            if resp.status_code == 401:
                self._token = None
                resp = await client.get(url, headers=await self._headers())
            if resp.status_code >= 400:
                raise RuntimeError(f"zoom.get_meeting: {_pretty_zoom_error(resp)}")
            return resp.json()


zoom = ZoomClient()
