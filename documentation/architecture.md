# RELAY Architecture

## System Boundaries

1. **3D Rendering (`src/simulation/disasterWorld.ts`, `src/simulation/quadrupedRobot.ts`, `src/components/RelayViewport.tsx`)**
   - Renders the Three.js PBR disaster scene, articulated quadruped gait kinematics, dynamic lights, dust particles, and live First-Person Robot Camera (FPV).
2. **Sensor Simulation (`src/simulation/sensors.ts`)**
   - Samples `groundTruthGrid` via 9-ray LiDAR fan, line-of-sight optical camera, and proximity hazard models.
   - Updates `beliefGrid` strictly for observed cells, preserving the separation between ground truth and AI knowledge.
3. **Commander Agent (`server/commanderAgent.ts`, `src/agents/commanderParser.ts`)**
   - Parses natural-language orders into structured `MissionPlan` and `MissionTask[]` schemas.
   - Never emits low-level motor commands or velocities.
4. **Navigation Agent (`src/agents/navigationAgent.ts`)**
   - Pure deterministic A* planner operating on `beliefGrid`.
   - Recalculates routes whenever LiDAR uncovers unmapped debris (e.g. collapsed Eastern Corridor).
5. **Safety Agent (`src/agents/safetyAgent.ts`)**
   - Deterministic verifier independent of the LLM.
   - Evaluates proposed `RoutePlan`s and live `SensorReading`s against hazard buffers, avoidance mandates, collision proximity, and round-trip battery reserves.
6. **ROS 2 / Gazebo Portability**
   - `SensorReading` maps directly to `sensor_msgs/LaserScan`, `sensor_msgs/Image`, and `sensor_msgs/BatteryState`.
   - `MissionTask` / `RoutePlan` map directly to `nav2_msgs/action/NavigateToPose` and structured action servers.
