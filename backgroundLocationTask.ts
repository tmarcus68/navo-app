// backgroundLocationTask.ts
import * as TaskManager from "expo-task-manager";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";

const LOCATION_TASK_NAME = "background-location-task";

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error(error.message);
    return;
  }
  if (data) {
    const { locations } = data as any;
    const location = locations[0];
    console.log("Received new location in background", location);

    // Send location to your API
    try {
      const apiUrl = await AsyncStorage.getItem("apiUrl");
      if (apiUrl) {
        await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            timestamp: new Date().toISOString(),
          }),
        });
      }
    } catch (err) {
      console.error("Failed to send location in background:", err);
    }
  }
});

export const startBackgroundUpdate = async () => {
  const { status } = await Location.requestBackgroundPermissionsAsync();
  if (status === "granted") {
    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.High,
      distanceInterval: 0, // or set a minimum distance to trigger
      timeInterval: 60000, // 60 seconds
      foregroundService: {
        notificationTitle: "Background location tracking",
        notificationBody: "We are tracking your location in the background",
        notificationColor: "#fff",
      },
    });
  }
};

export const stopBackgroundUpdate = async () => {
  await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
};
