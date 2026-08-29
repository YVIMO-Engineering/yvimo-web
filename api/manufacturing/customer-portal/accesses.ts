import { randomBytes } from 'node:crypto';
import { allowRequest, authenticateRequest, createServiceRoleSupabaseClient, methodNotAllowed, safeError, type ApiRequest, type ApiResponse } from '../../../server/apiSupport.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const accessProfiles = new Set(['standard', 'admin', 'documents']);

function temporaryPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = randomBytes(14);
  const core = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
  return `Yv!${core}7`;
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== 'POST') return methodNotAllowed(response, 'POST');
  try {
    const auth = await authenticateRequest(request);
    if (!auth) return response.status(401).json({ error: 'Unauthorized.' });
    if (!allowRequest(`customer-portal-access:${auth.user.id}`, 20, 60 * 60 * 1000)) {
      return response.status(429).json({ error: 'Too many access creation requests. Try again later.' });
    }

    const body = (request.body ?? {}) as Record<string, unknown>;
    const organizationId = String(body.organizationId ?? '');
    const customerId = String(body.customerId ?? '');
    const email = String(body.email ?? '').trim().toLowerCase();
    const accessProfile = String(body.accessProfile ?? 'standard');
    if (!uuidPattern.test(organizationId) || !uuidPattern.test(customerId)) return response.status(400).json({ error: 'Invalid organization or customer.' });
    if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) return response.status(400).json({ error: 'Enter a valid email address.' });
    if (!accessProfiles.has(accessProfile)) return response.status(400).json({ error: 'Invalid access profile.' });

    const { data: membership } = await auth.client.from('manufacturing_organization_members').select('role').eq('organization_id', organizationId).eq('user_id', auth.user.id).maybeSingle<{ role: string }>();
    if (!membership || !['Owner', 'Admin'].includes(membership.role)) return response.status(403).json({ error: 'Organization administrator access required.' });
    const { data: customer } = await auth.client.from('mes_customers').select('id, customer_name, legal_name').eq('organization_id', organizationId).eq('id', customerId).maybeSingle<{ id: string; customer_name: string; legal_name: string }>();
    if (!customer) return response.status(404).json({ error: 'Customer was not found in this organization.' });

    const admin = createServiceRoleSupabaseClient();
    const password = temporaryPassword();
    const displayName = email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: displayName, company_name: customer.customer_name, role: 'customer_portal' },
      app_metadata: { account_type: 'customer_portal' },
    });
    if (createError || !created.user) {
      const duplicate = createError?.message.toLowerCase().includes('already') || createError?.message.toLowerCase().includes('registered');
      return response.status(duplicate ? 409 : 400).json({ error: duplicate ? 'An account already exists for this email.' : 'Unable to create the Customer Portal login.' });
    }

    const permissions = accessProfile === 'documents'
      ? { orders: false, tools: false, documents: true, shipments: false, notifications: true }
      : { orders: true, tools: true, documents: true, shipments: true, notifications: true, manage_users: accessProfile === 'admin' };
    const { data: access, error: accessError } = await admin.from('customer_portal_accesses').insert({
      organization_id: organizationId,
      customer_id: customerId,
      user_id: created.user.id,
      email,
      access_profile: accessProfile,
      permissions,
      created_by: auth.user.id,
    }).select('id, user_id, email, access_profile, status, created_at').single();
    if (accessError) {
      console.error('[customer-portal] access insert failed', { code: accessError.code, message: accessError.message, details: accessError.details, hint: accessError.hint });
      await admin.auth.admin.deleteUser(created.user.id);
      return response.status(400).json({ error: 'The login was rolled back because its Customer Portal access could not be saved.' });
    }

    return response.status(201).json({ access, customer: { id: customer.id, name: customer.customer_name }, temporaryPassword: password });
  } catch (caught) {
    return safeError(response, caught, 'Unable to create Customer Portal access.');
  }
}
