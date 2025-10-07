export function isProfileComplete(profile) {
    if (!profile) return false
    const required = [
        profile.residence,
        profile.emergency_contact,
        profile.whatsapp,
        profile.reason,
    ]
    return required.every((v) => (v ?? "").toString().trim().length > 0)
}