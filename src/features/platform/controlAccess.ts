// The UID is an identifier, not a credential. Firestore remains authoritative.
export const CONTROL_UID = "bngmYLSrq5fTXlvxm62aAzGSoWJ3"
export function isControlIdentity(uid: string | null | undefined): boolean {
 return uid === CONTROL_UID
}
export function isVerifiedControl(uid: string | null | undefined, claims: Record<string, unknown>): boolean {
 return isControlIdentity(uid) && claims.lionfitSuperAdmin === true && claims.email_verified === true
}
