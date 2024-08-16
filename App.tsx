import React, { useState, useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Alert,
  Platform,
  ActivityIndicator,
} from "react-native";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";

const log = (message: string) =>
  console.log(`[${new Date().toISOString()}] ${message}`);
const errorLog = (message: string) =>
  console.error(`[${new Date().toISOString()}] ${message}`);

export default function App() {
  const [apiUrl, setApiUrl] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isDisabled, setIsDisabled] = useState(false);
  const [location, setLocation] = useState<{
    latitude: number;
    longitude: number;
    timestamp: string;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [intervalId, setIntervalId] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const loadApiUrl = async () => {
      try {
        const savedApiUrl = await AsyncStorage.getItem("apiUrl");
        if (savedApiUrl) setApiUrl(savedApiUrl);
      } catch (err) {
        const typedError = err as Error;
        errorLog("Failed to load API URL: " + typedError.message);
      }
    };

    loadApiUrl();

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [intervalId]);

  const handleApiUrlChange = async (url: string) => {
    setApiUrl(url);
    try {
      await AsyncStorage.setItem("apiUrl", url);
    } catch (err) {
      const typedError = err as Error;
      errorLog("Failed to save API URL: " + typedError.message);
    }
  };

  const sendLocation = async (latitude: number, longitude: number) => {
    setLoading(true);
    setIsDisabled(true);
    log("Sending location to " + apiUrl);
    try {
      const timestamp = new Date().toISOString();
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          latitude,
          longitude,
          timestamp,
        }),
      });

      if (!response.ok) {
        const errorResponse = await response.json();
        throw new Error(
          `Error ${response.status}: ${
            errorResponse.message || "Failed to send location data"
          }`
        );
      }

      const responseData = await response.json();
      log("Response data: " + JSON.stringify(responseData));

      setLocation({
        latitude,
        longitude,
        timestamp,
      });
      setErrorMessage(null);
    } catch (err: unknown) {
      const typedError = err as Error;
      let message = "An unexpected error occurred";

      if (typedError.message.includes("Network request failed")) {
        message =
          "Network request failed. Please check your connection or API server.";
      } else if (typedError.message.includes("Failed to send location data")) {
        message = "Failed to send location data. Please check your API server.";
      }

      errorLog(message);
      setErrorMessage(message);
      Alert.alert("Error", message);
    } finally {
      setLoading(false);
      setIsDisabled(false);
    }
  };

  const requestPermission = async (type: "foreground" | "background") => {
    if (type === "foreground") {
      const { status } = await Location.requestForegroundPermissionsAsync();
      return status === "granted";
    } else if (Platform.OS === "android" || Platform.OS === "ios") {
      const { status } = await Location.requestBackgroundPermissionsAsync();
      return status === "granted";
    }
    return true; // No background permission needed for other platforms
  };

  const startSending = async () => {
    if (!apiUrl) {
      Alert.alert("Error", "API URL is not set");
      setIsDisabled(false);
      return;
    }

    try {
      const hasForegroundPermission = await requestPermission("foreground");
      if (!hasForegroundPermission) {
        Alert.alert(
          "Permission Denied",
          "Please enable location permissions in your device settings."
        );
        setIsDisabled(false);
        return;
      }

      const hasBackgroundPermission = await requestPermission("background");
      if (!hasBackgroundPermission) {
        Alert.alert(
          "Background Permission Required",
          "Please enable background location permissions in your device settings."
        );
        setIsDisabled(false);
        return;
      }

      // Fetch and send the current location immediately
      try {
        const initialLocation = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });

        const { latitude, longitude } = initialLocation.coords;
        await sendLocation(latitude, longitude);
      } catch (err) {
        const typedError = err as Error;
        errorLog("Error fetching initial location: " + typedError.message);
        setIsDisabled(false);
        return;
      }

      // Start the interval-based location checking
      const id = setInterval(async () => {
        try {
          const newLocation = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.High,
          });

          const { latitude, longitude } = newLocation.coords;

          if (
            !location ||
            location.latitude !== latitude ||
            location.longitude !== longitude
          ) {
            await sendLocation(latitude, longitude);
          }
        } catch (err) {
          const typedError = err as Error;
          errorLog("Error fetching location: " + typedError.message);
        }
      }, 10000); // 10 seconds

      setIntervalId(id);
      setIsSending(true);
    } catch (err) {
      const typedError = err as Error;
      errorLog("Error starting location updates: " + typedError.message);
      setIsDisabled(false);
    }
  };

  const stopSending = () => {
    if (intervalId) {
      clearInterval(intervalId);
      setIntervalId(null);
    }
    setLoading(false);
    setIsDisabled(false);
    setErrorMessage(null);
    setLocation(null);
    setIsSending(false);
  };

  const handleButtonPress = () => {
    setLoading(true);
    setIsDisabled(true);
    if (isSending) {
      stopSending();
    } else {
      startSending();
    }
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder="Enter API URL"
        value={apiUrl}
        onChangeText={handleApiUrlChange}
        editable={!isSending}
      />
      <TouchableOpacity
        style={[
          styles.button,
          isSending ? styles.stopButton : styles.startButton,
          isDisabled && styles.disabledButton,
        ]}
        onPress={handleButtonPress}
        disabled={isDisabled}
      >
        <Text style={styles.buttonText}>
          {isSending ? "Stop Sending Geolocation" : "Start Sending Geolocation"}
        </Text>
      </TouchableOpacity>
      {loading && (
        <ActivityIndicator size="large" color="#0000ff" style={styles.loader} />
      )}
      {location && !loading && (
        <View style={styles.locationInfo}>
          <Text>Last Latitude: {location.latitude}</Text>
          <Text>Last Longitude: {location.longitude}</Text>
          <Text>Last Timestamp: {location.timestamp}</Text>
        </View>
      )}
      {errorMessage && (
        <View style={styles.error}>
          <Text style={styles.errorText}>{errorMessage}</Text>
          <Text style={styles.errorText}>
            Please try again later or check your connection.
          </Text>
        </View>
      )}
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  input: {
    height: 40,
    borderColor: "gray",
    borderWidth: 1,
    width: "100%",
    marginBottom: 20,
    paddingHorizontal: 10,
  },
  button: {
    height: 40,
    width: "100%",
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  startButton: {
    backgroundColor: "green",
  },
  stopButton: {
    backgroundColor: "red",
  },
  disabledButton: {
    opacity: 0.5,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
  },
  locationInfo: {
    marginTop: 20,
  },
  loader: {
    marginTop: 20,
  },
  error: {
    marginTop: 20,
    padding: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "red",
    backgroundColor: "#fdd",
  },
  errorText: {
    color: "red",
    textAlign: "center",
  },
});
