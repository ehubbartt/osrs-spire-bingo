<script>
  let { tiles, progress, onTileClick } = $props();

  // Tile type colors
  const tileColors = {
    skilling: '#4CAF50',
    elite_skilling: '#66BB6A',
    pvm: '#F44336',
    elite_pvm: '#EF5350',
    ca: '#2196F3',
    elite_ca: '#42A5F5',
    mystery: '#9C27B0',
    boss: '#FF9800'
  };

  // Pan and zoom state
  let zoom = $state(1);
  let panX = $state(0);
  let panY = $state(0);
  let isPanning = $state(false);
  let startX = $state(0);
  let startY = $state(0);
  let svgElement = $state(null);

  // Zoom controls
  function zoomIn() {
    zoom = Math.min(zoom + 0.2, 3); // Max 3x zoom
  }

  function zoomOut() {
    zoom = Math.max(zoom - 0.2, 0.5); // Min 0.5x zoom
  }

  function resetView() {
    zoom = 1;
    panX = 0;
    panY = 0;
  }

  // Pan controls
  function handleMouseDown(e) {
    isPanning = true;
    startX = e.clientX - panX;
    startY = e.clientY - panY;
    if (svgElement) {
      svgElement.style.cursor = 'grabbing';
    }
  }

  function handleMouseMove(e) {
    if (!isPanning) return;
    e.preventDefault();
    panX = e.clientX - startX;
    panY = e.clientY - startY;
  }

  function handleMouseUp() {
    isPanning = false;
    if (svgElement) {
      svgElement.style.cursor = 'grab';
    }
  }

  // Touch support for mobile
  function handleTouchStart(e) {
    if (e.touches.length === 1) {
      isPanning = true;
      startX = e.touches[0].clientX - panX;
      startY = e.touches[0].clientY - panY;
    }
  }

  function handleTouchMove(e) {
    if (!isPanning || e.touches.length !== 1) return;
    e.preventDefault();
    panX = e.touches[0].clientX - startX;
    panY = e.touches[0].clientY - startY;
  }

  function handleTouchEnd() {
    isPanning = false;
  }

  // Wheel zoom
  function handleWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    zoom = Math.max(0.5, Math.min(3, zoom + delta));
  }

  // Get tile status
  function getTileStatus(tileId) {
    const tileProgress = progress.find(p => p.tile_id === tileId);
    return tileProgress?.status || 'locked';
  }

  // Get tile progress data
  function getTileProgress(tileId) {
    return progress.find(p => p.tile_id === tileId);
  }

  // Check if tile is accessible (for visual feedback)
  function isAccessible(tile) {
    const status = getTileStatus(tile.id);
    return status === 'unlocked' || status === 'completed' || status === 'selectable';
  }
</script>

<div class="map-container">
  <!-- Zoom controls -->
  <div class="controls">
    <button onclick={zoomIn} class="control-btn" title="Zoom In">+</button>
    <button onclick={zoomOut} class="control-btn" title="Zoom Out">−</button>
    <button onclick={resetView} class="control-btn reset-btn" title="Reset View">⟲</button>
  </div>

  <div
    class="svg-wrapper"
    onmousedown={handleMouseDown}
    onmousemove={handleMouseMove}
    onmouseup={handleMouseUp}
    onmouseleave={handleMouseUp}
    ontouchstart={handleTouchStart}
    ontouchmove={handleTouchMove}
    ontouchend={handleTouchEnd}
    onwheel={handleWheel}
  >
    <svg
      bind:this={svgElement}
      class="tile-map"
      viewBox="0 -20 600 540"
      xmlns="http://www.w3.org/2000/svg"
      style="transform: scale({zoom}) translate({panX / zoom}px, {panY / zoom}px); cursor: grab;"
    >
      <!-- Draw connections first (so they appear behind tiles) -->
      {#each tiles as tile}
    {#each tile.connections as connectedId}
      {@const connectedTile = tiles.find(t => t.id === connectedId)}
      {#if connectedTile}
        <line
          x1={tile.position.x}
          y1={tile.position.y}
          x2={connectedTile.position.x}
          y2={connectedTile.position.y}
          class="connection"
          class:active={isAccessible(tile)}
        />
      {/if}
    {/each}
  {/each}

  <!-- Draw tiles -->
  {#each tiles as tile}
    {@const status = getTileStatus(tile.id)}
    {@const tileProgress = getTileProgress(tile.id)}
    <g
      class="tile"
      class:locked={status === 'locked'}
      class:unlocked={status === 'unlocked'}
      class:selectable={status === 'selectable'}
      class:completed={status === 'completed'}
      class:boss={tile.type === 'boss'}
      onclick={() => onTileClick(tile, tileProgress)}
      role="button"
      tabindex="0"
    >
      <!-- Current active tile indicator (pulsing ring) -->
      {#if status === 'unlocked'}
        <circle
          cx={tile.position.x}
          cy={tile.position.y}
          r={tile.type === 'boss' ? 25 : 20}
          fill="none"
          stroke="#ffffff"
          stroke-width="2"
          class="active-indicator"
        />
      {/if}

      <!-- Tile circle -->
      <circle
        cx={tile.position.x}
        cy={tile.position.y}
        r={tile.type === 'boss' ? 20 : 15}
        fill={tileColors[tile.type]}
        class="tile-circle"
      />

      <!-- Elite tiles get a glow effect -->
      {#if tile.type.startsWith('elite')}
        <circle
          cx={tile.position.x}
          cy={tile.position.y}
          r={tile.type === 'boss' ? 24 : 18}
          fill="none"
          stroke={tileColors[tile.type]}
          stroke-width="2"
          class="tile-glow"
        />
      {/if}

      <!-- Status indicator -->
      {#if status === 'completed'}
        <text
          x={tile.position.x}
          y={tile.position.y + 5}
          text-anchor="middle"
          class="status-icon"
        >
          ✓
        </text>
      {:else if status === 'locked'}
        <text
          x={tile.position.x}
          y={tile.position.y + 5}
          text-anchor="middle"
          class="status-icon lock"
        >
          🔒
        </text>
      {/if}

      <!-- Powerup indicator -->
      {#if tile.powerup && status !== 'completed'}
        <circle
          cx={tile.position.x + 10}
          cy={tile.position.y - 10}
          r="5"
          fill="#FFD700"
          class="powerup-indicator"
        />
      {/if}
    </g>
  {/each}
</svg>
  </div>
</div>

<style>
  .map-container {
    position: relative;
    width: 100%;
  }

  .controls {
    position: absolute;
    top: 10px;
    right: 10px;
    display: flex;
    gap: 5px;
    z-index: 10;
  }

  .control-btn {
    width: 40px;
    height: 40px;
    background: #16213e;
    border: 2px solid #e94560;
    border-radius: 8px;
    color: white;
    font-size: 24px;
    font-weight: bold;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    user-select: none;
  }

  .control-btn:hover {
    background: #1f2d50;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(233, 69, 96, 0.3);
  }

  .control-btn:active {
    transform: translateY(0);
  }

  .reset-btn {
    font-size: 20px;
  }

  .svg-wrapper {
    width: 100%;
    height: 600px;
    overflow: hidden;
    background: #0f1923;
    border-radius: 12px;
    touch-action: none;
    user-select: none;
  }

  .tile-map {
    width: 100%;
    height: 100%;
    display: block;
    transition: transform 0.1s ease-out;
  }

  .connection {
    stroke: #333;
    stroke-width: 2;
    opacity: 0.3;
  }

  .connection.active {
    stroke: #555;
    opacity: 0.6;
  }

  .tile {
    cursor: pointer;
  }

  .tile.locked {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .tile.selectable {
    opacity: 0.8;
    cursor: pointer;
  }

  .tile.selectable .tile-circle {
    stroke: #FFD700;
    stroke-width: 2;
    animation: glow 1.5s infinite;
  }

  @keyframes glow {
    0%, 100% {
      stroke-opacity: 0.5;
    }
    50% {
      stroke-opacity: 1;
    }
  }

  .active-indicator {
    animation: activePulse 2s infinite;
  }

  @keyframes activePulse {
    0%, 100% {
      stroke-opacity: 0.6;
      stroke-width: 2;
    }
    50% {
      stroke-opacity: 1;
      stroke-width: 2.5;
    }
  }

  .tile-circle {
    transition: all 0.2s;
  }

  .tile:not(.locked):hover .tile-circle {
    filter: brightness(1.2);
    r: 17;
  }

  .tile.boss:not(.locked):hover .tile-circle {
    r: 23;
  }

  .tile.boss .tile-circle {
    stroke: #FFA726;
    stroke-width: 3;
  }

  .tile-glow {
    opacity: 0.3;
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0%, 100% {
      opacity: 0.3;
    }
    50% {
      opacity: 0.6;
    }
  }

  .status-icon {
    font-size: 16px;
    fill: white;
    pointer-events: none;
    user-select: none;
  }

  .status-icon.lock {
    font-size: 12px;
  }

  .powerup-indicator {
    animation: bounce 1s infinite;
  }

  @keyframes bounce {
    0%, 100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-3px);
    }
  }

  .tile.completed .tile-circle {
    opacity: 0.7;
  }
</style>
