import { FaStar } from 'react-icons/fa';

export default function StarRating({ value = 0, onChange, size = 24, readonly = false }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={readonly}
          onClick={() => !readonly && onChange?.(star)}
          className={`${readonly ? 'cursor-default' : 'cursor-pointer hover:scale-110 transition-transform'}`}
        >
          <FaStar
            size={size}
            className={star <= value ? 'text-secondary' : 'text-borderGray'}
          />
        </button>
      ))}
    </div>
  );
}
