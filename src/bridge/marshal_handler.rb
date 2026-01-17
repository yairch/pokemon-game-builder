require 'json'

# Define RPG Maker XP classes so Marshal can load them
module RPG
  class Map
    attr_accessor :tileset_id, :width, :height, :autoplay_bgm, :bgm, :autoplay_bgs, :bgs
    attr_accessor :encounter_list, :encounter_step, :data, :events
    def initialize(width, height)
      @tileset_id = 1
      @width = width
      @height = height
      @autoplay_bgm = false
      @bgm = RPG::AudioFile.new
      @autoplay_bgs = false
      @bgs = RPG::AudioFile.new
      @encounter_list = []
      @encounter_step = 30
      @data = Table.new(width, height, 3)
      @events = {}
    end
  end

  class MapInfo
    attr_accessor :name, :parent_id, :order, :expanded, :scroll_x, :scroll_y
  end

  class AudioFile
    attr_accessor :name, :volume, :pitch
    def initialize(name = "", volume = 100, pitch = 100)
      @name = name
      @volume = volume
      @pitch = pitch
    end
  end

  class Event
    attr_accessor :id, :name, :x, :y, :pages
    def initialize(x, y)
      @id = 0
      @name = ""
      @x = x
      @y = y
      @pages = [RPG::Event::Page.new]
    end

    class Page
      attr_accessor :condition, :graphic, :move_type, :move_speed, :move_frequency
      attr_accessor :move_route, :walk_anime, :step_anime, :direction_fix, :through
      attr_accessor :always_on_top, :trigger, :list
      def initialize
        @condition = RPG::Event::Condition.new
        @graphic = RPG::Event::Graphic.new
        @move_type = 0
        @move_speed = 3
        @move_frequency = 3
        @move_route = RPG::MoveRoute.new
        @walk_anime = true
        @step_anime = false
        @direction_fix = false
        @through = false
        @always_on_top = false
        @trigger = 0
        @list = [RPG::EventCommand.new]
      end
    end

    class Condition
      attr_accessor :switch1_valid, :switch2_valid, :variable_valid, :self_switch_valid
      attr_accessor :switch1_id, :switch2_id, :variable_id, :variable_value, :self_switch_ch
      def initialize
        @switch1_valid = false
        @switch2_valid = false
        @variable_valid = false
        @self_switch_valid = false
      end
    end

    class Graphic
      attr_accessor :tile_id, :character_name, :character_hue, :direction, :pattern, :opacity, :blend_type
      def initialize
        @tile_id = 0
        @character_name = ""
        @character_hue = 0
        @direction = 2
        @pattern = 0
        @opacity = 255
        @blend_type = 0
      end
    end
  end

  class EventCommand
    attr_accessor :code, :indent, :parameters
    def initialize(code = 0, indent = 0, parameters = [])
      @code = code
      @indent = indent
      @parameters = parameters
    end
  end

  class MoveRoute
    attr_accessor :repeat, :skippable, :list
    def initialize
      @repeat = true
      @skippable = false
      @list = [RPG::MoveCommand.new]
    end
  end

  class MoveCommand
    attr_accessor :code, :parameters
    def initialize(code = 0, parameters = [])
      @code = code
      @parameters = parameters
    end
  end
end

# Table class used by RPG Maker XP for map data
class Table
  def initialize(x, y, z = 1)
    @xsize = x
    @ysize = y
    @zsize = z
    @data = Array.new(x * y * z, 0)
  end
  def [](x, y, z = 0)
    @data[x + y * @xsize + z * @xsize * @ysize]
  end
  def []=(x, y, z = 0, v)
    @data[x + y * @xsize + z * @xsize * @ysize] = v
  end
  def _dump(limit)
    [@xsize, @ysize, @zsize, @xsize * @ysize * @zsize].pack("VVVV") + @data.pack("v*")
  end
  def self._load(obj)
    x, y, z, size = obj[0, 16].unpack("VVVV")
    t = Table.new(x, y, z)
    t.instance_variable_set(:@data, obj[16..-1].unpack("v*"))
    t
  end
end

def create_map(file_path, map_data_json)
  data = JSON.parse(map_data_json)
  map = RPG::Map.new(data['width'], data['height'])
  map.tileset_id = data['tilesetId']
  
  # Fill map data
  layers = data['layers'] || data['data'] || []
  (0...3).each do |z|
    (0...map.height).each do |y|
      (0...map.width).each do |x|
        map.data[x, y, z] = layers[z][y][x] || 0
      end
    end
  end
  
  # Add events (minimal placeholders)
  events = {}
  (data['events'] || []).each_with_index do |event_data, index|
    event = RPG::Event.new(event_data['x'], event_data['y'])
    event.id = index + 1
    event.name = event_data['name'] || "Event#{event.id}"
    events[event.id] = event
  end
  map.events = events
  
  File.open(file_path, 'wb') do |f|
    Marshal.dump(map, f)
  end
  puts "Map created successfully at #{file_path}"
end

def update_map_infos(file_path, map_id, name)
  map_infos = {}
  if File.exist?(file_path) && File.size?(file_path)
    File.open(file_path, 'rb') do |f|
      map_infos = Marshal.load(f) || {}
    end
  end

  map_id = map_id.to_i
  max_order = map_infos.values.map { |info| info.order }.compact.max || 0

  info = map_infos[map_id] || RPG::MapInfo.new
  info.name = name
  info.parent_id = 0 if info.parent_id.nil?
  info.order = max_order + 1 if info.order.nil?
  info.expanded = true if info.expanded.nil?
  info.scroll_x = 0 if info.scroll_x.nil?
  info.scroll_y = 0 if info.scroll_y.nil?

  map_infos[map_id] = info

  File.open(file_path, 'wb') do |f|
    Marshal.dump(map_infos, f)
  end
  puts "MapInfos updated with map #{map_id}"
end

if __FILE__ == $0
  command = ARGV[0]
  case command
  when 'create_map'
    create_map(ARGV[1], ARGV[2])
  when 'update_map_infos'
    update_map_infos(ARGV[1], ARGV[2], ARGV[3])
  else
    puts "Unknown command: #{command}"
  end
end
