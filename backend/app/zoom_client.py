# app/zoom_client.py
from typing import Optional
import httpx
from .config import settings

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

    async def create_meeting(
        self,
        user_id: str,
        topic: str,
        start_time_iso: str,
        duration_minutes: int,
        timezone: str = "America/Guayaquil",
        waiting_room: bool = True,
        join_before_host: bool = False,
        passcode: Optional[str] = None,
    ) -> dict:
        api_base = settings.ZOOM_API_BASE.rstrip("/")
        url = f"{api_base}/users/{user_id}/meetings"

        payload = {
            "topic": topic,
            "type": 2,  # scheduled
            "start_time": start_time_iso,  # e.g. 2025-09-11T15:00:00Z
            "duration": duration_minutes,
            "timezone": timezone,
            "password": passcode,
            "settings": {
                "waiting_room": waiting_room,
                "join_before_host": join_before_host,
                "approval_type": 2,
                "mute_upon_entry": True,
                "participant_video": False,
                "host_video": False,
            },
        }
        if passcode is None:
            payload.pop("password")

        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(url, json=payload, headers=await self._headers())
            if resp.status_code == 401:
                self._token = None
                resp = await client.post(url, json=payload, headers=await self._headers())
            resp.raise_for_status()
            return resp.json()

    # ✅ NUEVO: actualizar reunión existente
    async def update_meeting(
        self,
        meeting_id: str,
        start_time_iso: str,
        duration_minutes: int,
        timezone: str = "America/Guayaquil",
        topic: Optional[str] = None,
    ) -> None:
        """
        PATCH /meetings/{meetingId}
        Se puede actualizar start_time, duration, timezone y opcionalmente topic.
        """
        api_base = settings.ZOOM_API_BASE.rstrip("/")
        url = f"{api_base}/meetings/{meeting_id}"

        payload = {
            "start_time": start_time_iso,
            "duration": duration_minutes,
            "timezone": timezone,
        }
        if topic:
            payload["topic"] = topic

        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.patch(url, json=payload, headers=await self._headers())
            if resp.status_code == 401:
                self._token = None
                resp = await client.patch(url, json=payload, headers=await self._headers())
            resp.raise_for_status()

zoom = ZoomClient()
