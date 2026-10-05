export function invitationAccountError(error: any) {
  const detail = error?.errors?.[0];
  if (detail?.code === 'form_identifier_exists') return {code:'ACCOUNT_EXISTS',message:'This email already has a RestroFlow login. Sign in with that email, then accept this restaurant invitation. This does not grant access to other restaurants.'};
  if (detail?.code?.startsWith('form_password_')) return {code:'PASSWORD_REJECTED',message:detail.longMessage || detail.message || 'Choose a stronger, unique password or a longer passphrase.'};
  return {code:'ACCOUNT_CREATION_FAILED',message:detail?.longMessage || detail?.message || 'Could not create your login. Please try again.'};
}
