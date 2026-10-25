import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '@/App';
import { AuthProvider } from '@/auth/AuthContext';
import { tokenStore } from '@/auth/tokenStore';
import { mockAuth } from '@/api/mock/auth';
import { DEMO_PASSWORD, resetDb } from '@/api/mock/db';
import { UiProvider } from '@/state/UiStore';

async function setup(path: string, as?: 'jamie' | 'emily') {
  localStorage.clear(); sessionStorage.clear();
  await resetDb();
  if (as) tokenStore.set((await mockAuth.signIn(`${as}@nexpill.demo`, DEMO_PASSWORD)).token, false);
  return render(<MemoryRouter initialEntries={[path]}><UiProvider><AuthProvider><App /></AuthProvider></UiProvider></MemoryRouter>);
}

describe('routing & auth guards', () => {
  it('sends signed-out visitors to the welcome page', async () => {
    await setup('/patient');
    expect(await screen.findByRole('heading', { name: /welcome to nexpill/i })).toBeInTheDocument();
  });
  it('keeps a patient out of the caregiver area', async () => {
    await setup('/caregiver', 'jamie');
    expect(await screen.findByText(/doses completed/i)).toBeInTheDocument();
  });
});

describe('welcome → sign up', () => {
  it('requires a role, then validates the form', async () => {
    await setup('/welcome');
    await userEvent.click(await screen.findByRole('button', { name: /create account/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/choose patient or caregiver/i);
    await userEvent.click(screen.getByRole('radio', { name: /caregiver/i }));
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));
    expect(await screen.findByRole('heading', { name: /caregiver account/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));
    expect(await screen.findByText(/enter your first name/i)).toBeInTheDocument();
    expect(screen.getByText(/please agree to continue/i)).toBeInTheDocument();
  });
  it('creates a patient account end to end', async () => {
    await setup('/signup/patient');
    await userEvent.type(await screen.findByLabelText(/first name/i), 'Lina');
    await userEvent.type(screen.getByLabelText(/last name/i), 'Haddad');
    await userEvent.type(screen.getByLabelText(/date of birth/i), '1970-05-01');
    await userEvent.type(screen.getByLabelText(/^email/i), 'lina@example.com');
    await userEvent.type(screen.getByLabelText(/^password/i), 'Strong123');
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'Strong123');
    await userEvent.click(screen.getByRole('checkbox', { name: /i agree/i }));
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));
    expect(await screen.findByRole('heading', { name: /no medications yet/i }, { timeout: 4000 })).toBeInTheDocument();
  });
});

describe('patient panel', () => {
  it('lets the patient mark the next dose as taken', async () => {
    await setup('/patient', 'jamie');
    expect(await screen.findByText('1 of 3 doses completed')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /mark lisinopril 10 mg as taken/i }));
    await waitFor(() => expect(screen.getByText('2 of 3 doses completed')).toBeInTheDocument());
  });
  it('requires text for a concern', async () => {
    await setup('/patient', 'jamie');
    await userEvent.click(await screen.findByRole('button', { name: /i have a concern/i }));
    await userEvent.click(screen.getByRole('button', { name: /send concern/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/tell us what worries you/i);
  });
  it('skip flow asks for confirmation and Esc closes it', async () => {
    await setup('/patient', 'jamie');
    await userEvent.click(await screen.findByRole('button', { name: /skip for now/i }));
    expect(screen.getByRole('dialog')).toHaveAccessibleName(/skip /i);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('caregiver panel', () => {
  it('shows the dashboard with the highest-risk patient and lets you switch', async () => {
    await setup('/caregiver', 'emily');
    expect(await screen.findByRole('heading', { name: /caregiver dashboard/i })).toBeInTheDocument();
    expect(await screen.findByRole('group', { name: /choose a patient/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /nadia cherif/i }));
    expect(await screen.findByRole('heading', { name: /medication timeline/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /nadia cherif/i })).toHaveAttribute('aria-pressed', 'true');
  });
});
