import { useState, useEffect } from 'react';
import { useAudioRecorder as useExpoAudioRecorder, AudioModule, RecordingPresets } from 'expo-audio';
import * as FileSystem from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import { Platform } from 'react-native';

const uriToBase64 = async (uri: string): Promise<string> => {
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    const blob = await response.blob();
    console.log('[uriToBase64] Blob type:', blob.type, '| Blob size:', blob.size, 'bytes');
    if (blob.size === 0) {
      throw new Error('Le blob audio est vide (taille 0). Vérifier que l\'enregistrement a bien démarré.');
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        console.log('[uriToBase64] DataURL prefix:', dataUrl.substring(0, 50));
        const base64data = dataUrl.split(',')[1];
        console.log('[uriToBase64] base64 length after split:', base64data?.length ?? 'undefined');
        resolve(base64data);
      };
      reader.onerror = (e) => {
        console.error('[uriToBase64] FileReader error:', e);
        reject(e);
      };
      reader.readAsDataURL(blob);
    });
  } else {
    return await FileSystem.readAsStringAsync(uri, {
      encoding: 'base64',
    });
  }
};

export function useAudioRecorder() {
  const recorder = useExpoAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (recorder.isRecording) {
      interval = setInterval(() => {
        setDuration(Math.floor(recorder.currentTime * 1000));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [recorder.isRecording, recorder.currentTime]);

  const startRecording = async () => {
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (permission.status !== 'granted') {
        alert('Permission required to record audio');
        return;
      }
      await AudioModule.setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      await recorder.prepareToRecordAsync();
      recorder.record();
      setDuration(0);
    } catch (err) {
      console.error('Failed to start recording', err);
    }
  };

  const stopRecording = async () => {
    try {
      await recorder.stop();
      await AudioModule.setAudioModeAsync({ allowsRecording: false });
      
      const uri = recorder.uri;
      console.log('[useAudioRecorder] recording stopped, uri:', uri);

      if (uri) {
        console.log('[useAudioRecorder] converting to base64...');
        const audioBase64 = await uriToBase64(uri);
        console.log('Base64 généré — longueur:', audioBase64?.length);
        if (!audioBase64 || audioBase64.length < 1000) {
          throw new Error('Audio trop court ou vide');
        }
        
        return { audioBase64, duration };
      }
    } catch (err) {
      console.error('[useAudioRecorder] Failed to stop recording', err);
    }
    return null;
  };

  const importAudio = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['audio/mpeg', 'audio/wav', 'audio/x-m4a', 'audio/m4a', '*/*'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        console.log('[useAudioRecorder] picked file:', file.uri, file.name, file.size);
        console.log('[useAudioRecorder] converting to base64...');
        const audioBase64 = await uriToBase64(file.uri);
        console.log('[useAudioRecorder] base64 length:', audioBase64.length);

        return {
          audioBase64,
          duration: null, // Depending on the audio API, duration might need external parsing
          fileName: file.name
        };
      }
    } catch (err) {
      console.error('[useAudioRecorder] Failed to pick document', err);
    }
    return null;
  };

  return { isRecording: recorder.isRecording, duration, startRecording, stopRecording, importAudio };
}
