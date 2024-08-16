import * as TaskManager from "expo-task-manager";
import * as Location from "expo-location";

const LOCATION_TASK_NAME = "background-location-task";

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error("Background task error:", error);
    return;
  }

  if (data) {
    const { locations } = data as { locations: Location.LocationObject[] };
    const { latitude, longitude } = locations[0].coords;

    console.log(
      `Received location in background: Latitude: ${latitude}, Longitude: ${longitude}`
    );

    // Handle the received location data, e.g., send it to your API
    try {
      // Implement your logic to send location data to your API
    } catch (err) {
      console.error("Error sending background location data:", err);
    }
  }
});

export const startBackgroundUpdate = async () => {
  try {
    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.High,
      timeInterval: 60000, // 60 seconds
      distanceInterval: 1, // Minimum distance (meters) between location updates
      showsBackgroundLocationIndicator: true, // iOS specific setting for showing location indicator
    });
    console.log("Background location updates started.");
  } catch (error) {
    console.error("Failed to start background location updates:", error);
  }
};

export const stopBackgroundUpdate = async () => {
  try {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    console.log("Background location updates stopped.");
  } catch (error) {
    console.error("Failed to stop background location updates:", error);
  }
};
