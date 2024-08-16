import React, { useState, useEffect, useCallback } from "react";
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
      stopSending();
    };
  }, []);

  const handleApiUrlChange = async (url: string) => {
    setApiUrl(url);
    try {
      await AsyncStorage.setItem("apiUrl", url);
    } catch (err) {
      const typedError = err as Error;
      errorLog("Failed to save API URL: " + typedError.message);
    }
  };

  const sendLocation = useCallback(
    async (latitude: number, longitude: number) => {
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
        } else if (
          typedError.message.includes("Failed to send location data")
        ) {
          message =
            "Failed to send location data. Please check your API server.";
        }

        errorLog(message);
        setErrorMessage(message);
        Alert.alert("Error", message);
      } finally {
        setLoading(false);
        setIsDisabled(false);
      }
    },
    [apiUrl]
  );

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

  const startSending = useCallback(async () => {
    setIsSending(true);

    if (intervalId) {
      clearInterval(intervalId);
      setIntervalId(null);
    }

    if (!apiUrl) {
      Alert.alert("Error", "API URL is not set");
      setIsSending(false);
      setLoading(false);
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
        setIsSending(false);
        setLoading(false);
        setIsDisabled(false);
        return;
      }

      const hasBackgroundPermission = await requestPermission("background");
      if (!hasBackgroundPermission) {
        Alert.alert(
          "Background Permission Required",
          "Please enable background location permissions in your device settings."
        );
        setIsSending(false);
        setLoading(false);
        setIsDisabled(false);
        return;
      }

      // Fetch and send the current location immediately
      let initialLocationData: { latitude: number; longitude: number } | null =
        null;
      try {
        const initialLocation = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });

        const { latitude, longitude } = initialLocation.coords;
        await sendLocation(latitude, longitude);
        setLocation({
          latitude,
          longitude,
          timestamp: new Date().toISOString(),
        });

        // Set the initial location as the previous location
        initialLocationData = { latitude, longitude };
        log(
          `Initial location set to: (${initialLocationData.latitude}, ${initialLocationData.longitude})`
        );
      } catch (err) {
        const typedError = err as Error;
        errorLog("Error fetching initial location: " + typedError.message);
        setIsSending(false);
        setLoading(false);
        setIsDisabled(false);
        return;
      }

      const hasLocationChanged = (
        prevLocation: { latitude: number; longitude: number } | null,
        newLocation: { latitude: number; longitude: number }
      ): boolean => {
        const thresholdMeters = 5;

        // Function to calculate the distance in meters between two coordinates
        const calculateDistanceInMeters = (
          lat1: number,
          lon1: number,
          lat2: number,
          lon2: number
        ) => {
          const R = 6371e3; // Earth's radius in meters
          const toRadians = (angle: number) => (angle * Math.PI) / 180;

          const φ1 = toRadians(lat1);
          const φ2 = toRadians(lat2);
          const Δφ = toRadians(lat2 - lat1);
          const Δλ = toRadians(lon2 - lon1);

          const a =
            Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

          return R * c; // Distance in meters
        };

        let distanceInMeters = 0;
        let hasChanged = true;

        if (prevLocation) {
          distanceInMeters = calculateDistanceInMeters(
            prevLocation.latitude,
            prevLocation.longitude,
            newLocation.latitude,
            newLocation.longitude
          );

          hasChanged = distanceInMeters > thresholdMeters;

          log(
            `Comparing locations: Previous (${prevLocation.latitude}, ${prevLocation.longitude}) - New (${newLocation.latitude}, ${newLocation.longitude})`
          );
          log(`Distance in meters: ${distanceInMeters}`);
          log(`Location changed: ${hasChanged}`);
        } else {
          log(
            `Initial location: (${newLocation.latitude}, ${newLocation.longitude})`
          );
        }

        return hasChanged;
      };

      // Start the interval-based location checking
      const id = setInterval(async () => {
        try {
          const newLocation = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.High,
          });

          const { latitude, longitude } = newLocation.coords;

          if (
            initialLocationData &&
            hasLocationChanged(initialLocationData, { latitude, longitude })
          ) {
            await sendLocation(latitude, longitude);
            setLocation({
              latitude,
              longitude,
              timestamp: new Date().toISOString(),
            });

            // Update previous location
            initialLocationData.latitude = latitude;
            initialLocationData.longitude = longitude;
          }
        } catch (err) {
          const typedError = err as Error;
          errorLog("Error fetching location: " + typedError.message);
        }
      }, 10000); // 10 seconds

      setIntervalId(id);
    } catch (err) {
      const typedError = err as Error;
      errorLog("Error starting location updates: " + typedError.message);
      setIsSending(false);
      setLoading(false);
      setIsDisabled(false);
    }
  }, [apiUrl, intervalId, sendLocation]);

  const stopSending = useCallback(() => {
    if (intervalId) {
      clearInterval(intervalId);
      setIntervalId(null);
    }
    setIsSending(false);
    setLoading(false);
    setIsDisabled(false);
    setErrorMessage(null);
    setLocation(null);
  }, [intervalId]);

  const handleButtonPress = useCallback(() => {
    setLoading(true);
    setIsDisabled(true);
    if (isSending) {
      log(">>>>> Stop Sending Geolocation");
      stopSending();
    } else {
      log(">>>>> Start Sending Geolocation");
      startSending();
    }
  }, [isSending, startSending, stopSending]);

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
      {location && (
        <View style={styles.locationContainer}>
          <Text style={styles.locationText}>Latitude: {location.latitude}</Text>
          <Text style={styles.locationText}>
            Longitude: {location.longitude}
          </Text>
          <Text style={styles.locationText}>
            Timestamp: {location.timestamp}
          </Text>
        </View>
      )}
      {errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}
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
    marginBottom: 20,
    paddingHorizontal: 10,
    width: "100%",
  },
  button: {
    padding: 15,
    borderRadius: 5,
    width: "100%",
    alignItems: "center",
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
  loader: {
    marginTop: 20,
  },
  locationContainer: {
    marginTop: 20,
  },
  locationText: {
    fontSize: 16,
  },
  errorText: {
    color: "red",
    marginTop: 20,
    fontSize: 16,
  },
});
