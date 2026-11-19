import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';

export async function selectOption(control, value) {
  await userEvent.click(control);
  const option = screen.getAllByRole('option').find((node) => node.dataset.value === value || node.textContent.replace('✓', '').trim() === value);
  if (!option) throw new Error(`No option ${value}`);
  await userEvent.click(option);
}
