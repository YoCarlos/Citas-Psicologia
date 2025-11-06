# app/payphone_client.py
from __future__ import annotations
from typing import Any, Dict
import httpx
from .config import settings

CONFIRM_URL_DEFAULT = "https://pay.payphonetodoesposible.com/api/button/V2/Confirm"

class PayphoneError(RuntimeError):
    pass

def confirm_button(*, transaction_id: int, client_tx_id: str) -> Dict[str, Any]:
    """
    Llama al endpoint Confirm de PayPhone.
    Envía { id: <transaction_id>, clientTxId: <client_tx_id> } con Bearer <PRIVATE_TOKEN>.
    Devuelve el JSON (dict) de PayPhone tal cual.
    Lanza PayphoneError si hay problema de red o status HTTP != 200.
    """
    confirm_url = getattr(settings, "PAYPHONE_CONFIRM_URL", CONFIRM_URL_DEFAULT) or CONFIRM_URL_DEFAULT
    private_token = getattr(settings, "PAYPHONE_PRIVATE_TOKEN", None)

    if not private_token:
        raise PayphoneError("PAYPHONE_PRIVATE_TOKEN no configurado")

    payload = {"id": transaction_id, "clientTxId": client_tx_id}
    headers = {
        "Authorization": f"Bearer SOipHLWpcsCZrl6bXr3VyF0Oig8G7rYHDFOAJFIDKBKPhJ4X5tubRPz2jOQeHW8lWgDEDMuIlfdDyqGPo1riCZ7iiYECuxJUjqj913fmqBSZsLKD2EbICb208mTrD3hzg5Ios1AFMSlqCWZz8CWjQ1Zn_mv4ctOLAiZtt60Un416i0Ec4teaTAk1U2H2Spgj_usDNecPQyVQA51kEqoSHL_pjHSZ6tHFya0vayelk38wRQE5wV4AjuDjMVBLT7Tuuz-y8WmxIJ478XVZEUH6G6CxDdAT5DYE43guQ9tVmjiOzOhekjpt_nY2wMF10duKjIeYSg",
        "Content-Type": "application/json",
    }

    try:
        with httpx.Client(timeout=15.0) as cli:
            resp = cli.post(confirm_url, json=payload, headers=headers)
    except Exception as ex:
        raise PayphoneError(f"Error de red al consultar PayPhone Confirm: {ex}") from ex

    if resp.status_code != 200:
        raise PayphoneError(f"Confirm HTTP {resp.status_code}: {resp.text}")

    try:
        data = resp.json()
    except Exception as ex:
        raise PayphoneError(f"Respuesta no es JSON válido: {ex}") from ex

    return data
