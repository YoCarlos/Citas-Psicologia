import React from "react"

export default function SideDrawer({ open, onClose, width = 260, children, title }) {
    return (
        <>
            {/* Backdrop */}
            <div
                className={`fixed inset-0 z-40 bg-black/40 transition-opacity md:hidden ${open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
                    }`}
                onClick={onClose}
            />

            {/* Drawer */}
            <aside
                className={`fixed z-50 top-0 left-0 h-full bg-white shadow-xl md:hidden transition-transform ${open ? "translate-x-0" : "-translate-x-full"
                    }`}
                style={{ width }}
                aria-hidden={!open}
            >
                <div className="flex items-center justify-between p-3 border-b">
                    <div className="font-bold text-emerald-700">{title ?? "Menú"}</div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg border hover:bg-gray-50"
                        aria-label="Cerrar menú"
                    >
                        ✕
                    </button>
                </div>
                {children}
            </aside>
        </>
    )
}
