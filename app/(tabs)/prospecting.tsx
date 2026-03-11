import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../../constants/theme';

export default function ProspectingScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Prospection — à venir</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream, alignItems: 'center', justifyContent: 'center' },
  text: { fontFamily: 'Outfit_600SemiBold', color: Colors.grey400, fontSize: 16 },
});
