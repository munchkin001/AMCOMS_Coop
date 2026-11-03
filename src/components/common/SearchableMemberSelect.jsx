import { useMemo, useRef, useState } from 'react';

const getMemberName = (member) => [
  member.first_name,
  member.middle_name,
  member.last_name
].filter(Boolean).join(' ') || 'Member';

const SearchableMemberSelect = ({
  members = [],
  options,
  extraOptions = [],
  value,
  onChange,
  placeholder = 'Select a member',
  loading = false,
  disabled = false,
  required = false,
  emptyMessage = 'No matching members found.',
  className = '',
  id,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedby
}) => {
  const memberOptions = useMemo(() => (options || members.map((member) => ({
    value: member.id,
    label: `${getMemberName(member)}${member.member_number ? ` (${member.member_number})` : ''}`,
    searchText: member.member_number || ''
  }))).map((option) => ({
    ...option,
    value: String(option.value),
    label: option.label || String(option.value)
  })), [members, options]);
  const allOptions = useMemo(() => [...memberOptions, ...extraOptions.map((option) => ({
    ...option,
    value: String(option.value)
  }))], [extraOptions, memberOptions]);
  const selectedOption = allOptions.find((option) => option.value === String(value ?? ''));
  const inputRef = useRef(null);
  const [query, setQuery] = useState(selectedOption?.label || '');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const filteredOptions = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    return allOptions
      .filter((option) => !search
        || `${option.label} ${option.searchText || ''}`.toLocaleLowerCase().includes(search))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
  }, [allOptions, query]);

  const selectOption = (option) => {
    setQuery(option.label);
    setIsOpen(false);
    setActiveIndex(-1);
    inputRef.current?.setCustomValidity('');
    onChange(option.value);
  };

  const handleKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((index) => filteredOptions.length
        ? index < 0 ? 0 : Math.min(index + 1, filteredOptions.length - 1)
        : -1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((index) => filteredOptions.length
        ? index < 0 ? filteredOptions.length - 1 : Math.max(index - 1, 0)
        : -1);
    } else if (event.key === 'Enter' && isOpen && filteredOptions[activeIndex]) {
      event.preventDefault();
      selectOption(filteredOptions[activeIndex]);
    } else if (event.key === 'Escape') {
      setIsOpen(false);
      setQuery(selectedOption?.label || '');
    }
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedby}
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-controls={id ? `${id}-listbox` : undefined}
        aria-activedescendant={isOpen && filteredOptions[activeIndex] && id ? `${id}-option-${activeIndex}` : undefined}
        autoComplete="off"
        required={required}
        disabled={disabled || loading}
        value={isOpen ? query : selectedOption?.label || ''}
        placeholder={loading ? 'Loading members...' : placeholder}
        onFocus={() => {
          setQuery('');
          setIsOpen(true);
          setActiveIndex(-1);
        }}
        onBlur={() => {
          setIsOpen(false);
          setQuery(selectedOption?.label || '');
        }}
        onChange={(event) => {
          const nextQuery = event.target.value;
          setQuery(nextQuery);
          setIsOpen(true);
          setActiveIndex(-1);
          event.target.setCustomValidity(nextQuery ? 'Choose a member from the list.' : '');
          if (value) onChange('');
        }}
        onKeyDown={handleKeyDown}
        className={`w-full rounded-lg border border-gray-300 bg-white px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-100 ${className}`}
      />
      {isOpen && !disabled && !loading && (
        <div
          id={id ? `${id}-listbox` : undefined}
          role="listbox"
          className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
        >
          {filteredOptions.length ? filteredOptions.map((option, index) => (
            <button
              id={id ? `${id}-option-${index}` : undefined}
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === String(value ?? '')}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectOption(option)}
              className={`block w-full px-3 py-2 text-left text-sm ${
                index === activeIndex ? 'bg-blue-50 text-blue-900' : 'text-gray-800 hover:bg-gray-50'
              }`}
            >
              {option.label}
            </button>
          )) : (
            <p className="px-3 py-2 text-sm text-gray-500">{emptyMessage}</p>
          )}
        </div>
      )}
    </div>
  );
};

export default SearchableMemberSelect;
