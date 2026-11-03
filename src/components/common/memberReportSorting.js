export const MEMBER_REPORT_SORT_OPTIONS = [
  { value: 'newest', label: 'Newest members first' },
  { value: 'oldest', label: 'Oldest members first' },
  { value: 'id-asc', label: 'Member ID: low to high' },
  { value: 'id-desc', label: 'Member ID: high to low' },
  { value: 'name-asc', label: 'Name: A–Z' },
  { value: 'name-desc', label: 'Name: Z–A' }
];

export const sortMemberReportRows = (members, sortBy = 'newest') => {
  const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
  const joinedDate = (member) => member.date_joined || '';
  const memberName = (member) => [member.first_name, member.middle_name, member.last_name].filter(Boolean).join(' ');
  const compare = (left, right) => {
    if (sortBy === 'newest') {
      if (!joinedDate(left)) return joinedDate(right) ? 1 : 0;
      if (!joinedDate(right)) return -1;
      return collator.compare(joinedDate(right), joinedDate(left));
    }
    if (sortBy === 'oldest') {
      if (!joinedDate(left)) return joinedDate(right) ? 1 : 0;
      if (!joinedDate(right)) return -1;
      return collator.compare(joinedDate(left), joinedDate(right));
    }
    if (sortBy === 'id-desc') return collator.compare(right.member_number || '', left.member_number || '');
    if (sortBy === 'name-desc') return collator.compare(memberName(right), memberName(left));
    if (sortBy === 'name-asc') return collator.compare(memberName(left), memberName(right));
    return collator.compare(left.member_number || '', right.member_number || '');
  };

  return members
    .map((member, index) => ({ member, index }))
    .sort((left, right) => {
      return compare(left.member, right.member) || left.index - right.index;
    })
    .map(({ member }) => member);
};
