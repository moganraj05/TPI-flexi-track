import { avatarStyle } from '../../theme';
import { initials } from '../../utils/format';

export function Avatar({ name, size }) {
  return <span style={avatarStyle(size)}>{initials(name)}</span>;
}
