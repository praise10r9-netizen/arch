import 'server-only';
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
  type KeyObject,
} from 'node:crypto';

export interface ApprovalPayload {
  schemaVersion: 1;
  approvalId: string;
  entryId: string;
  traineeId: string;
  traineeName: string;
  mentorId: string;
  mentorName: string;
  activity: {
    date: string;
    category: string;
    description: string;
    hours: number;
    submittedAt: string;
  };
  approvedAt: string;
  algorithm: 'Ed25519';
  keyId: string;
}

export function getApprovalSigningKey() {
  const encodedKey = process.env.APPROVAL_SIGNING_PRIVATE_KEY;
  const encodedPublicKey = process.env.APPROVAL_SIGNING_PUBLIC_KEY;
  const keyId = process.env.APPROVAL_SIGNING_KEY_ID;
  if (!encodedKey || !encodedPublicKey || !keyId) {
    throw new Error(
      'APPROVAL_SIGNING_PRIVATE_KEY, APPROVAL_SIGNING_PUBLIC_KEY, and APPROVAL_SIGNING_KEY_ID must be configured.',
    );
  }

  let privateKey: KeyObject;
  try {
    privateKey = createPrivateKey({
      key: Buffer.from(encodedKey, 'base64'),
      format: 'der',
      type: 'pkcs8',
    });
  } catch (error) {
    throw new Error('APPROVAL_SIGNING_PRIVATE_KEY must be base64-encoded PKCS#8 DER.', {
      cause: error,
    });
  }
  if (privateKey.asymmetricKeyType !== 'ed25519') {
    throw new Error('APPROVAL_SIGNING_PRIVATE_KEY must be an Ed25519 key.');
  }
  let configuredPublicKey: KeyObject;
  try {
    configuredPublicKey = createPublicKey({
      key: Buffer.from(encodedPublicKey, 'base64'),
      format: 'der',
      type: 'spki',
    });
  } catch (error) {
    throw new Error('APPROVAL_SIGNING_PUBLIC_KEY must be base64-encoded SPKI DER.', {
      cause: error,
    });
  }
  if (configuredPublicKey.asymmetricKeyType !== 'ed25519') {
    throw new Error('APPROVAL_SIGNING_PUBLIC_KEY must be an Ed25519 key.');
  }
  const publicKeyObject = createPublicKey(privateKey);
  const publicKeyDer = publicKeyObject.export({ type: 'spki', format: 'der' });
  const configuredPublicKeyDer = configuredPublicKey.export({ type: 'spki', format: 'der' });
  if (!publicKeyDer.equals(configuredPublicKeyDer)) {
    throw new Error('Configured approval signing public and private keys do not match.');
  }
  if (!/^[A-Za-z0-9._-]{1,120}$/.test(keyId)) {
    throw new Error('APPROVAL_SIGNING_KEY_ID contains unsupported characters.');
  }

  const publicKey = publicKeyObject
    .export({ type: 'spki', format: 'pem' })
    .toString();
  return {
    privateKey,
    publicKey,
    publicKeyDerBase64: publicKeyDer.toString('base64'),
    keyId,
  };
}

export function signApprovalPayload(payload: ApprovalPayload) {
  const { privateKey, publicKey, keyId } = getApprovalSigningKey();
  if (payload.keyId !== keyId) {
    throw new Error('Approval payload key id does not match the configured signing key.');
  }

  const serializedPayload = JSON.stringify(payload);
  const payloadBytes = Buffer.from(serializedPayload, 'utf8');
  return {
    serializedPayload,
    payloadSha256: createHash('sha256').update(payloadBytes).digest('hex'),
    signature: sign(null, payloadBytes, privateKey),
    publicKeyPem: publicKey,
    keyId,
  };
}
