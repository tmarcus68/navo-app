import * as TaskManager from "expo-task-manager";
import * as Location from "expo-location";

const LOCATION_TASK_NAME = "background-location-task";

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error(`Background task error: ${error.message}`);
    return;
  }

  if (data) {
    const { locations } = data as { locations: Location.LocationObject[] };
    const { latitude, longitude } = locations[0].coords;
    const timestamp = new Date().toISOString();

    // Send location data to your server or process it as needed
    console.log(
      `Background Location: Latitude: ${latitude}, Longitude: ${longitude}, Timestamp: ${timestamp}`
    );
  }
});

export const startBackgroundUpdate = async () => {
  const hasStarted = await Location.hasStartedLocationUpdatesAsync(
    LOCATION_TASK_NAME
  );
  if (hasStarted) {
    console.log("Background location updates already started.");
    return;
  }

  console.log("Starting background location updates...");
  await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
    accuracy: Location.Accuracy.High,
    timeInterval: 60000, // 1 minute
    distanceInterval: 10, // 10 meters
  });
};

export const stopBackgroundUpdate = async () => {
  console.log("Stopping background location updates...");
  await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
};
