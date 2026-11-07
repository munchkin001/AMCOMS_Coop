export const MEMBER_REPORT_SORT_OPTIONS = [
  { value: 'newest', label: 'Newest members first' },
  { value: 'oldest', label: 'Oldest members first' },
  { value: 'name-asc', label: 'Name: A–Z' },
  { value: 'name-desc', label: 'Name: Z–A' }
];

export const sortMemberReportRows = (members = [], sortBy = 'newest') => {
  const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

  const getJoinedDate = (member) => (member?.date_joined ?? '').toString();
  const getMemberName = (member) =>
    [member?.first_name, member?.middle_name, member?.last_name]
      .filter(Boolean)
      .join(' ')
      .trim();

  return [...members].sort((a, b) => {
    if (sortBy === 'name-asc') {
      return collator.compare(getMemberName(a), getMemberName(b));
    }

    if (sortBy === 'name-desc') {
      return collator.compare(getMemberName(b), getMemberName(a));
    }

    const aDate = getJoinedDate(a);
    const bDate = getJoinedDate(b);

    if (!aDate && !bDate) return 0;
    if (!aDate) return 1;
    if (!bDate) return -1;

    if (sortBy === 'oldest') {
      return aDate.localeCompare(bDate);
    }

    return bDate.localeCompare(aDate);
  });
};
