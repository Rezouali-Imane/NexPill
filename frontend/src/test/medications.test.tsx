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
  localStorage.clear();
  sessionStorage.clear();
  await resetDb();
  if (as) {
    tokenStore.set((await mockAuth.signIn(`${as}@nexpill.demo`, DEMO_PASSWORD)).token, false);
  }
  return render(
    <MemoryRouter initialEntries={[path]}>
      <UiProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </UiProvider>
    </MemoryRouter>
  );
}

describe('medications & add medication flow', () => {
  it('opens add medication dialog and adds a new medication', async () => {
    await setup('/patient/medications', 'jamie');

    // Jamie already has Lisinopril, Metformin, Atorvastatin
    expect(await screen.findByRole('heading', { name: /lisinopril/i })).toBeInTheDocument();

    // Click "+ Add medication" button in page header
    const addButtons = screen.getAllByRole('button', { name: /add medication/i });
    await userEvent.click(addButtons[0]);

    // Modal should be visible
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^add medication$/i })).toBeInTheDocument();

    // Fill in medication details
    const nameInput = screen.getByLabelText(/medication name/i);
    await userEvent.type(nameInput, 'Amoxicillin');

    const strengthInput = screen.getByLabelText(/strength \/ dosage/i);
    await userEvent.type(strengthInput, '250mg');

    const instrInput = screen.getByLabelText(/instructions/i);
    await userEvent.type(instrInput, 'Take with food and full glass of water');

    // Submit
    await userEvent.click(screen.getByRole('button', { name: /save medication/i }));

    // Verify modal closes and new medication card is displayed
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    const amoxHeading = await screen.findByRole('heading', { name: /amoxicillin/i });
    expect(amoxHeading).toBeInTheDocument();
    const card = amoxHeading.closest('article');
    expect(card?.textContent).toContain('Take with food and full glass of water');
    expect(card?.textContent).toContain('250mg');
  });

  it('renders both add medication and load sample plan buttons on empty overview', async () => {
    // Sign up a brand new user who has 0 medications initially
    await setup('/signup/patient');
    await userEvent.type(await screen.findByLabelText(/first name/i), 'Omar');
    await userEvent.type(screen.getByLabelText(/last name/i), 'Farooq');
    await userEvent.type(screen.getByLabelText(/date of birth/i), '1985-02-15');
    await userEvent.type(screen.getByLabelText(/^email/i), 'omar@example.com');
    await userEvent.type(screen.getByLabelText(/^password/i), 'StrongPass1');
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'StrongPass1');
    await userEvent.click(screen.getByRole('checkbox', { name: /i agree/i }));
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));

    // Empty state on Overview
    expect(await screen.findByRole('heading', { name: /no medications yet/i }, { timeout: 4000 })).toBeInTheDocument();

    // Verify both "Add a medication" and "Load a sample plan (demo)" buttons exist
    const addMedBtn = screen.getByRole('button', { name: /add a medication/i });
    const loadSampleBtn = screen.getByRole('button', { name: /load a sample plan \(demo\)/i });
    expect(addMedBtn).toBeInTheDocument();
    expect(loadSampleBtn).toBeInTheDocument();

    // Click "Load a sample plan (demo)"
    await userEvent.click(loadSampleBtn);

    // Should load the sample medications and doses
    expect(await screen.findByText(/doses completed/i, {}, { timeout: 4000 })).toBeInTheDocument();
  });
});
