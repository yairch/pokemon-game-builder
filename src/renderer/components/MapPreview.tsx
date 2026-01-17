import React from 'react';

interface MapPreviewProps {
  mapData: any; // We'll define a better type later
}

const MapPreview: React.FC<MapPreviewProps> = ({ mapData }) => {
  return (
    <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
      <h2 className="text-lg font-semibold mb-2">Map Preview</h2>
      <div className="flex items-center justify-center h-[250px] bg-gray-50 rounded border border-dashed border-gray-300">
        {mapData ? (
          <div className="text-center">
            <p className="text-blue-600 font-medium">{mapData.name}</p>
            <p className="text-sm text-gray-500">{mapData.width}x{mapData.height} tiles</p>
          </div>
        ) : (
          <p className="text-gray-400">No map generated yet</p>
        )}
      </div>
    </div>
  );
};

export default MapPreview;
