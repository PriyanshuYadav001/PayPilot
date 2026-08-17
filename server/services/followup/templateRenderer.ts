/**
 * Template renderer for follow-up message bodies.
 * Replaces {{variable}} placeholders with actual invoice/customer data.
 */

export interface TemplateVariables {
  contactName: string;
  companyName: string;
  invoiceNumber: string;
  amount: string;
  dueDate: string;
  paymentLink: string;
}

const VARIABLE_MAP: Record<string, keyof TemplateVariables> = {
  contact_name: 'contactName',
  company_name: 'companyName',
  invoice_number: 'invoiceNumber',
  amount: 'amount',
  due_date: 'dueDate',
  payment_link: 'paymentLink',
};

export function renderTemplate(template: string, variables: TemplateVariables): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    const varKey = VARIABLE_MAP[key];
    if (varKey && variables[varKey] !== undefined) {
      return variables[varKey];
    }
    return match;
  });
}

export function renderSubject(template: string | undefined, variables: TemplateVariables): string | undefined {
  if (!template) return undefined;
  return renderTemplate(template, variables);
}
