#define VERIPATH_MATCHER_TEST
#include "../road_matcher.cpp"
#include <cassert>
int main(){using namespace veripath;
  assert(normalize("West 42nd Street")=="W 42 ST");
  std::vector<Road> roads={{"a","pa","MAIN ST","MM",{{0,0},{200,0}}},{"b","pb","SIDE ST","MM",{{0,10},{200,10}}},{"bridge","pc","BRIDGE RD","AA",{{0,200},{200,200}}}};
  Index index(roads);
  auto a=index.match({50,3},"Main Street");assert(a.id=="a"&&a.status=="strong");
  auto ambiguous=index.match({50,5},"");assert(ambiguous.status=="ambiguous");
  auto bridge=index.match({50,200},"Bridge Road");assert(bridge.status=="ambiguous");
  assert(index.match({500,500},"").status=="unmatched");
  Index unknown({{"unknown","u","MAIN ST","",{{0,0},{200,0}}}});assert(unknown.match({50,0},"Main Street").status=="ambiguous");
  Index split_pieces({{"left","same","MAIN ST","MM",{{0,0},{100,0}}},{"right","same","MAIN ST","MM",{{100,0},{200,0}}}});assert(split_pieces.match({100,0},"Main Street").status=="ambiguous");
  roads[0].line={{0,0},{50,0},{100,0},{200,0}};Index subdivided(roads);assert(subdivided.match({50,3},"Main Street").distance==a.distance);
  std::cout<<"Passed C++23: street normalization, named parallel roads, ambiguous roads, grade separation, unmatched points, sampling invariance.\n";
}
