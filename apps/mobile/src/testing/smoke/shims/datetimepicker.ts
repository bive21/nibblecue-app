/**
 * @react-native-community/datetimepicker for the boot smoke test. Its entry is Flow source with
 * no web build, and the wheel is a native view the shell never draws on its first frames: the
 * component renders nothing, and the Android imperative API does nothing.
 */
const DateTimePicker = (): null => null;
export const DateTimePickerAndroid = {
  open: (): void => undefined,
  dismiss: (): void => undefined,
};
export default DateTimePicker;
