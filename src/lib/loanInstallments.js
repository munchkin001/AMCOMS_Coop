const roundCurrency = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export const getLoanInstallmentBreakdown = (loan, installmentNumber = 1, amountDue) => {
  const principalAmount = Number(loan?.principal_amount || 0);
  const totalAmount = Number(loan?.total_amount ?? principalAmount);
  const totalInterest = Math.max(
    Number(loan?.total_interest ?? (totalAmount - principalAmount)),
    0
  );
  const termMonths = Number(loan?.term_months || 0);
  const fallbackInstallments = loan?.payment_frequency === 'weekly'
    ? Math.round(termMonths * 52 / 12)
    : termMonths;
  const requestedInstallments = Number(loan?.installments || fallbackInstallments || 1);
  const installments = Math.max(Math.round(requestedInstallments), 1);
  const currentInstallment = Math.min(Math.max(Math.round(Number(installmentNumber) || 1), 1), installments);
  const regularAmount = Number(
    loan?.installment_amount ??
    loan?.monthly_payment ??
    roundCurrency(totalAmount / installments)
  );
  const scheduledAmount = Number(
    amountDue ??
    (currentInstallment === installments
      ? totalAmount - regularAmount * (installments - 1)
      : regularAmount)
  );
  const regularInterest = roundCurrency(totalInterest / installments);
  const scheduledInterest = currentInstallment === installments
    ? roundCurrency(totalInterest - regularInterest * (installments - 1))
    : regularInterest;

  return {
    principal: Math.max(roundCurrency(scheduledAmount - scheduledInterest), 0),
    interest: scheduledInterest,
    total: scheduledAmount,
  };
};
