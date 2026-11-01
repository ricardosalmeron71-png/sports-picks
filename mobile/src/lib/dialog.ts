// Avisos y confirmaciones que funcionan igual en Android, iPhone y web.
// (Alert.alert de React Native no hace nada en la versión web.)
import { Alert, Platform } from "react-native";

export function showAlert(title: string, message?: string) {
  if (Platform.OS === "web") {
    // eslint-disable-next-line no-alert
    globalThis.alert?.(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}

export function confirmAsync(title: string, message: string, okLabel = "Aceptar"): Promise<boolean> {
  if (Platform.OS === "web") {
    // eslint-disable-next-line no-alert
    return Promise.resolve(globalThis.confirm?.(`${title}\n\n${message}`) ?? false);
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: "Cancelar", style: "cancel", onPress: () => resolve(false) },
      { text: okLabel, onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}
